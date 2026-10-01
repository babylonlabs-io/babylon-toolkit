import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { calculate } from "@/applications/aave/positionNotifications";
import type { CalculatorParams } from "@/applications/aave/positionNotifications/types";
import { COPY } from "@/copy";
import { formatBtcAmount, formatCompactPrice } from "@/utils/formatting";

import { LiquidationPreview } from "../LiquidationPreview";

/**
 * The position and the candle series are the two data hooks this section owns,
 * so they are mocked at the module boundary; the cascade, the chart projection
 * and core-ui's `Timeline` all run for real, so the test cannot drift from the
 * maths the component re-runs.
 */
let mockParams: CalculatorParams | null = null;

vi.mock("@/context/wallet", () => ({
  useETHWallet: () => ({ address: "0xdepositor" }),
  useConnection: () => ({ isConnected: true }),
}));

vi.mock("@/applications/aave/hooks/usePositionNotifications", () => ({
  usePositionNotifications: () => ({
    params: mockParams,
    result: mockParams ? calculate(mockParams) : null,
  }),
}));

vi.mock("@/applications/aave/hooks/useBtcPriceCandles", () => ({
  TIMELINE_VISIBLE_CANDLES: 365,
  useBtcPriceCandles: () => ({ candles: mockCandles }),
}));

/** A year of daily candles, the window the preview charts. */
const YEAR_OF_CANDLES = Array.from({ length: 365 }, (_, i) => ({
  time: Date.UTC(2025, 0, 6) + i * 86_400_000,
  open: 86_000,
  high: 92_000,
  low: 84_000,
  close: 88_000,
}));
let mockCandles = YEAR_OF_CANDLES;

/**
 * A real two-vault position: 0.4 + 0.3 BTC at $88,400 against $22,000 of debt,
 * CF 0.5.
 */
const PARAMS: CalculatorParams = {
  btcPrice: 88_400,
  totalDebtUsd: 22_000,
  vaults: [
    { id: "v-1", name: "Vault 1", btc: 0.4 },
    { id: "v-2", name: "Vault 2", btc: 0.3 },
  ],
  CF: 0.5,
  THF: 1.1,
  LB: 1.05,
  expectedHF: 0.95,
  minPeginBtc: null,
};

/**
 * One 0.7 BTC vault at $88,400 against $24,500, CF 0.5: `calculate()` puts its
 * single trigger at exactly $70,000, and $1,750 more debt moves it to $75,000.
 * Those two triggers straddle a rounding step in the price axis — a $70,000
 * floor rounds the axis top to $100,000, a $75,000 one to $95,000 — so a chart
 * that re-derives its axis from the projection draws the SECOND, riskier
 * position with a wider gap to its first liquidation.
 */
const SINGLE_VAULT_PARAMS: CalculatorParams = {
  btcPrice: 88_400,
  totalDebtUsd: 24_500,
  vaults: [{ id: "v-1", name: "Vault 1", btc: 0.7 }],
  CF: 0.5,
  THF: 1.1,
  LB: 1.05,
  expectedHF: 0.95,
  minPeginBtc: null,
};
const AXIS_STEP_CROSSING_BORROW_USD = 1_750;

/**
 * The longest cascade the protocol can produce: ten vaults, each seized in its
 * own event. Found by sweeping `calculate()` — equal-sized vaults group into
 * far fewer events, so a realistic spread is what actually reaches ten.
 */
const TEN_EVENT_PARAMS: CalculatorParams = {
  ...PARAMS,
  totalDebtUsd: 11_715,
  CF: 0.201,
  vaults: [
    0.242, 0.227, 0.085, 0.104, 0.188, 0.16, 0.128, 0.058, 0.106, 0.432,
  ].map((btc, i) => ({ id: `v-${i}`, name: `Vault ${i + 1}`, btc })),
};

/** The first trigger the cascade puts on a position carrying `extraDebtUsd`. */
function firstTrigger(extraDebtUsd: number, params = PARAMS): number {
  const { groups } = calculate({
    ...params,
    totalDebtUsd: params.totalDebtUsd + extraDebtUsd,
  });
  return groups[0].liquidationPrice;
}

describe("LiquidationPreview", () => {
  beforeEach(() => {
    mockCandles = YEAR_OF_CANDLES;
  });

  it("charts the events the entered borrow amount would create, not the current ones", () => {
    mockParams = PARAMS;
    const borrowedUsd = 10_000;

    const { container } = render(
      <LiquidationPreview additionalDebtUsd={borrowedUsd} />,
    );

    // Borrowing more raises every trigger, closing the gap to the BTC price —
    // the projected level is on the chart and the current one is not.
    expect(firstTrigger(borrowedUsd)).toBeGreaterThan(firstTrigger(0));
    const chart = within(container);
    expect(
      chart.getByText(formatCompactPrice(firstTrigger(borrowedUsd))),
    ).toBeInTheDocument();
    expect(
      chart.queryByText(formatCompactPrice(firstTrigger(0))),
    ).not.toBeInTheDocument();
  });

  it("names each event with the BTCVaults it seizes", () => {
    mockParams = PARAMS;

    const { container } = render(<LiquidationPreview additionalDebtUsd={0} />);

    const { groups } = calculate(PARAMS);
    const amounts = groups[0].vaults.map((vault) => vault.btc).join(" + ");
    expect(
      within(container).getByText(
        COPY.liquidations.preview.bandLabel(1, amounts),
      ),
    ).toBeInTheDocument();
  });

  it("reports the position's whole collateral, including vaults no event consumes", () => {
    mockParams = PARAMS;

    render(<LiquidationPreview additionalDebtUsd={0} />);

    // 0.4 + 0.3, including the vault the cascade never has to consume.
    expect(
      screen.getByText(`${formatBtcAmount(0.7)} (2 vaults)`),
    ).toBeInTheDocument();
  });

  // The whole point of the preview is that adding debt visibly closes the gap
  // between the BTC price and the first liquidation. The axis is therefore
  // built from the LIVE position: re-deriving it from the projection re-rounds
  // its top as the trigger rises, and across this fixture's rounding step that
  // draws the riskier position with the WIDER gap.
  it("narrows the drawn gap to the first event as the borrow amount rises", () => {
    mockParams = SINGLE_VAULT_PARAMS;

    const gapFor = (borrowedUsd: number) => {
      const { container, unmount } = render(
        <LiquidationPreview additionalDebtUsd={borrowedUsd} />,
      );
      const priceLineY = Number.parseFloat(
        container
          .querySelector('[data-testid="liq-current-price-line"]')
          ?.getAttribute("y1") ?? "NaN",
      );
      const firstBandY = Number.parseFloat(
        container
          .querySelector('[data-testid="liq-band-0"]')
          ?.getAttribute("y") ?? "NaN",
      );
      unmount();
      return firstBandY - priceLineY;
    };

    expect(firstTrigger(0, SINGLE_VAULT_PARAMS)).toBeCloseTo(70_000, 0);
    expect(
      firstTrigger(AXIS_STEP_CROSSING_BORROW_USD, SINGLE_VAULT_PARAMS),
    ).toBeCloseTo(75_000, 0);

    const before = gapFor(0);
    const after = gapFor(AXIS_STEP_CROSSING_BORROW_USD);
    expect(before).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });

  // Compressed into the design's five-event frame, a cascade this long drops
  // every band label — the rows fall under one line of text. The frame grows
  // with the event count instead, so each event stays named.
  //
  // Coverage limit: jsdom never fires ResizeObserver, so the chart always
  // measures the 1016px fallback. That proves the labels render for a full
  // cascade, and that the frame grows at all, but it is wider than the card's
  // real ~470-540px — where the row budget is what actually decides whether a
  // tenth event keeps its name. The narrow case rests on the arithmetic in
  // HEIGHT_PER_EVENT_PX, not on this test.
  it("keeps every event named at the longest cascade the protocol allows", () => {
    const chartHeightFor = (params: CalculatorParams) => {
      mockParams = params;
      const { container, unmount } = render(
        <LiquidationPreview additionalDebtUsd={0} />,
      );
      const height = Number.parseFloat(
        container
          .querySelector(".bbn-liq-chart__svg")
          ?.getAttribute("height") ?? "NaN",
      );
      unmount();
      return height;
    };
    const designFrameHeight = chartHeightFor(SINGLE_VAULT_PARAMS);

    const { groups } = calculate(TEN_EVENT_PARAMS);
    expect(groups).toHaveLength(10);

    mockParams = TEN_EVENT_PARAMS;
    const { container } = render(<LiquidationPreview additionalDebtUsd={0} />);
    const chart = within(container);
    groups.forEach((group, index) => {
      const amounts = group.vaults.map((vault) => vault.btc).join(" + ");
      expect(
        chart.getByText(
          COPY.liquidations.preview.bandLabel(index + 1, amounts),
        ),
      ).toBeInTheDocument();
    });

    expect(chartHeightFor(TEN_EVENT_PARAMS)).toBeGreaterThan(designFrameHeight);
  });

  it("charts the frame while the candle series is still empty", () => {
    mockParams = PARAMS;
    mockCandles = [];

    const { container } = render(<LiquidationPreview additionalDebtUsd={0} />);

    expect(container.querySelector(".bbn-liq-chart__svg")).toBeTruthy();
    expect(
      container.querySelectorAll('[data-testid="liq-candle"]'),
    ).toHaveLength(0);
    expect(screen.getByTestId("liq-band-0")).toBeInTheDocument();
  });

  it("renders nothing while the debt the amount adds is unknown", () => {
    mockParams = PARAMS;

    const { container } = render(
      <LiquidationPreview additionalDebtUsd={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  // The cascade reads a deferred amount, so a chart drawn from the previous
  // one would survive a commit past the point the debt became unknown — a
  // stale projection left on screen exactly when the card should withdraw.
  //
  // Coverage limit: `rerender` runs inside `act`, which flushes the deferred
  // pass too, so the intermediate commit is not observable here. This pins the
  // contract (a charted card withdraws when its amount goes unknown); the
  // timing rests on the guard reading the prop rather than the deferred copy.
  it("withdraws immediately when a charted amount becomes unknown", () => {
    mockParams = PARAMS;

    const { container, rerender } = render(
      <LiquidationPreview additionalDebtUsd={10_000} />,
    );
    expect(container).not.toBeEmptyDOMElement();

    rerender(<LiquidationPreview additionalDebtUsd={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the position has no charted cascade", () => {
    mockParams = null;

    const { container } = render(<LiquidationPreview additionalDebtUsd={0} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when governance params leave the cascade with no events", () => {
    // A collateral factor this high clamps the seizure fraction out of range,
    // so `calculate()` returns no groups while the debt is still there.
    mockParams = { ...PARAMS, CF: 0.92 };

    const { container } = render(<LiquidationPreview additionalDebtUsd={0} />);

    expect(container).toBeEmptyDOMElement();
  });
});
