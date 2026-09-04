import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { calculate } from "@/applications/aave/positionNotifications";
import type { CalculatorParams } from "@/applications/aave/positionNotifications/types";
import { formatHealthFactor } from "@/applications/aave/utils";
import { COPY } from "@/copy";
import type { LiquidationPositionOverride } from "@/overrides/liquidations";
import { formatBtcAmount, formatPriceUsd, formatUsd } from "@/utils/formatting";

/**
 * `usePositionNotifications` and `useDashboardState` are the Aave-scoped data
 * hooks — mocked at the module boundary, same as the Loans page tests. Every
 * other collaborator (the calculator, the chart projection, the toolbar) runs
 * for real: `LIVE_RESULT` below is the actual `calculate()` output for
 * `LIVE_PARAMS`, so the two can never disagree the way hand-picked numbers
 * could.
 */

const useConnectionMock = vi.fn();
const useETHWalletMock = vi.fn();
const useDashboardStateMock = vi.fn();
const usePositionNotificationsMock = vi.fn();
const usePositionCascadeOverrideMock = vi.fn();
const useLiquidationPositionOverrideMock = vi.fn();

vi.mock("@/context/wallet", () => ({
  useConnection: () => useConnectionMock(),
  useETHWallet: () => useETHWalletMock(),
}));

vi.mock("@/hooks/useDashboardState", () => ({
  useDashboardState: () => useDashboardStateMock(),
}));

vi.mock("@/applications/aave/hooks/usePositionNotifications", () => ({
  usePositionNotifications: () => usePositionNotificationsMock(),
}));

vi.mock("@/overrides/position", () => ({
  usePositionCascadeOverride: () => usePositionCascadeOverrideMock(),
}));

vi.mock("@/overrides/liquidations", () => ({
  useLiquidationPositionOverride: () => useLiquidationPositionOverrideMock(),
}));

/**
 * The candle series is a separate indexer read from the cascade, mocked at the
 * same module boundary as the other Aave-scoped data hooks.
 */
const useBtcPriceCandlesMock = vi.fn();

vi.mock("@/applications/aave/hooks/useBtcPriceCandles", () => ({
  useBtcPriceCandles: () => useBtcPriceCandlesMock(),
}));

vi.mock("@/hooks/useLoanActions", () => ({
  useLoanActions: () => ({
    openBorrowPicker: vi.fn(),
    openRepay: vi.fn(),
    goToReserve: vi.fn(),
  }),
}));

vi.mock("react-router", () => ({
  useOutletContext: () => ({ openDeposit: vi.fn() }),
}));

vi.mock("@/components/shared", () => ({
  EmptyState: ({
    isConnected,
    title,
    description,
    actionLabel,
  }: {
    isConnected?: boolean;
    title?: string;
    description?: string;
    actionLabel?: string;
  }) => (
    <div
      data-testid="liquidations-empty-state"
      data-connected={String(Boolean(isConnected))}
      data-action-label={actionLabel ?? ""}
    >
      <p>{title}</p>
      {description && <p>{description}</p>}
    </div>
  ),
}));

import Liquidations from "../index";
import { axisFloorPrice } from "../liquidationChartData";

const CANDLES = Array.from({ length: 30 }, (_, i) => ({
  time: Date.UTC(2026, 4, 5) + i * 86_400_000,
  open: 60_000,
  high: 66_000,
  low: 58_000,
  close: 62_000,
}));

// A real 2-vault, non-cliff, non-dust position (B1 in calculate.test.ts:
// [0.65, 0.35] at the default params produces exactly 2 groups, the second a
// full liquidation).
const LIVE_PARAMS: CalculatorParams = {
  btcPrice: 61_722.5,
  totalDebtUsd: 44_287.72,
  vaults: [
    { id: "vault-1", name: "Vault 1", btc: 0.65 },
    { id: "vault-2", name: "Vault 2", btc: 0.35 },
  ],
  CF: 0.75,
  THF: 1.1,
  maxLB: 1.05,
  expectedHF: 0.95,
};
const LIVE_RESULT = calculate(LIVE_PARAMS);
const [firstGroup, secondGroup] = LIVE_RESULT.groups;

const CONNECTED_WITH_CASCADE = {
  collateralBtc: 1,
  collateralValueUsd: 61_722.5,
  debtValueUsd: 44_287.72,
  healthFactor: LIVE_RESULT.currentHF,
  healthFactorStatus: "safe" as const,
  hasCollateral: true,
  hasLoans: true,
  // CF 0.75 as bps, matching LIVE_PARAMS.CF exactly (7_500 / BPS_SCALE).
  collateralFactorBps: 7_500,
  isLoading: false,
  borrowedAssets: [{ symbol: "USDC" }],
  selectableBorrowedAssets: [{ symbol: "USDC", name: "USDC", icon: "" }],
};

const READY_NOTIFICATIONS = {
  result: LIVE_RESULT,
  params: LIVE_PARAMS,
  status: "ready" as const,
  isLoading: false,
  reorderVerificationContext: null,
};

// A single-vault god-mode scenario, deliberately shaped nothing like
// LIVE_PARAMS/CONNECTED_WITH_CASCADE above (different price, debt, vault
// count) so a test can tell at a glance whether the page rendered the real
// live position or the fabricated one.
const GOD_MODE_PARAMS: CalculatorParams = {
  btcPrice: 100_000,
  totalDebtUsd: 50_000,
  vaults: [{ id: "god-vault-1", name: "God Vault 1", btc: 2 }],
  CF: 0.5,
  THF: 1.1,
  maxLB: 1.05,
  expectedHF: 0.95,
};
const GOD_MODE_RESULT = calculate(GOD_MODE_PARAMS);

// The text entry and the slider share an accessible name (both drive the same
// simulated price), so disambiguate by role rather than label text alone.
const priceInput = () =>
  screen.getByRole("textbox", {
    name: COPY.liquidations.simulatePriceEntryLabel,
  }) as HTMLInputElement;

const priceSlider = () =>
  screen.getByRole("slider", {
    name: COPY.liquidations.simulateLabel,
  }) as HTMLInputElement;

const resetButton = () =>
  screen.getByRole("button", { name: COPY.liquidations.reset });

/**
 * The header's "Seized" figure. Scoped to its label because the chart's share
 * axis prints the same percentages.
 */
const seizedSummary = () =>
  screen.getByText(COPY.liquidations.seizedSummaryLabel).parentElement
    ?.textContent;

function setPrice(price: number) {
  fireEvent.change(priceInput(), { target: { value: String(price) } });
  fireEvent.blur(priceInput());
}

function connectWallet() {
  useConnectionMock.mockReturnValue({ isConnected: true });
  useETHWalletMock.mockReturnValue({ address: "0xabc" });
}

/** Manual mode off, matching the real store's default (untouched in production). */
function disableGodMode() {
  usePositionCascadeOverrideMock.mockReturnValue(null);
}

function enableGodMode() {
  usePositionCascadeOverrideMock.mockReturnValue({
    result: GOD_MODE_RESULT,
    status: null,
    params: GOD_MODE_PARAMS,
  });
}

/** Position override off, matching the real store's default (untouched in production). */
function disablePositionOverride() {
  useLiquidationPositionOverrideMock.mockReturnValue(null);
}

// Deliberately shaped nothing like CONNECTED_WITH_CASCADE/GOD_MODE_RESULT
// (different collateral, debt, health factor) so a test can tell at a glance
// whether the page rendered the live/cascade position or this override.
const POSITION_OVERRIDE: LiquidationPositionOverride = {
  collateralBtc: 5,
  debtUsd: 123_456,
  healthFactor: 1.8,
};

function enablePositionOverride() {
  useLiquidationPositionOverrideMock.mockReturnValue(POSITION_OVERRIDE);
}

describe("Liquidation Dashboard — connection and position gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBtcPriceCandlesMock.mockReturnValue({
      candles: CANDLES,
      isLoading: false,
      error: null,
    });
    disableGodMode();
    disablePositionOverride();
  });

  it("renders the connect empty state and no chart while disconnected", () => {
    useConnectionMock.mockReturnValue({ isConnected: false });
    useETHWalletMock.mockReturnValue({ address: undefined });
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_WITH_CASCADE,
      hasCollateral: false,
      hasLoans: false,
    });
    usePositionNotificationsMock.mockReturnValue({
      ...READY_NOTIFICATIONS,
      result: null,
      params: null,
      status: "no-wallet",
    });

    render(<Liquidations />);

    const emptyState = screen.getByTestId("liquidations-empty-state");
    expect(emptyState).toHaveAttribute("data-connected", "false");
    expect(
      screen.getByText(COPY.liquidations.emptyDisconnected),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("liq-current-price-line"),
    ).not.toBeInTheDocument();
  });

  it("renders the real collateral figure alongside the borrow empty state once collateral exists with no loans yet", () => {
    connectWallet();
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_WITH_CASCADE,
      hasCollateral: true,
      hasLoans: false,
    });
    usePositionNotificationsMock.mockReturnValue({
      ...READY_NOTIFICATIONS,
      result: null,
      params: null,
      status: "no-vaults",
    });

    render(<Liquidations />);

    const emptyState = screen.getByTestId("liquidations-empty-state");
    expect(emptyState).toHaveAttribute("data-connected", "true");
    expect(emptyState).toHaveAttribute(
      "data-action-label",
      COPY.liquidations.empty.borrow,
    );
    expect(
      screen.getByText(COPY.liquidations.empty.noLoanTitle),
    ).toBeInTheDocument();
    // Regression: known collateral must stay visible here — a depositor with
    // real collateral must not see a bare empty state with no stats at all
    // just because they haven't borrowed yet (mirrors Loans.tsx, whose
    // LoansSummary stays visible once `hasCollateral` and only the
    // loans-list region swaps to its own inline empty state).
    expect(
      screen.getByText(
        `${formatUsd(CONNECTED_WITH_CASCADE.collateralValueUsd)} USD`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("liq-current-price-line"),
    ).not.toBeInTheDocument();
  });

  it("draws the candle series and the safe zone above the first trigger", () => {
    connectWallet();
    useDashboardStateMock.mockReturnValue(CONNECTED_WITH_CASCADE);
    usePositionNotificationsMock.mockReturnValue(READY_NOTIFICATIONS);

    render(<Liquidations />);

    expect(screen.getAllByTestId("liq-candle")).toHaveLength(CANDLES.length);
    expect(
      screen.getByText(COPY.liquidations.safeZone.title),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        COPY.liquidations.safeZone.noEventsAbove(
          formatPriceUsd(firstGroup.liquidationPrice),
        ),
      ),
    ).toBeInTheDocument();
    // The dashboard names the seized amount inline in the band label.
    expect(
      screen.getByText(
        `${COPY.liquidations.eventTitle(1)} (${formatBtcAmount(firstGroup.combinedBtc)})`,
      ),
    ).toBeInTheDocument();
  });

  // The series is a separate request from the cascade, so the frame has to
  // stand on its own while it is missing.
  it("still renders the chart frame with no candle series", () => {
    connectWallet();
    useDashboardStateMock.mockReturnValue(CONNECTED_WITH_CASCADE);
    usePositionNotificationsMock.mockReturnValue(READY_NOTIFICATIONS);
    useBtcPriceCandlesMock.mockReturnValue({
      candles: null,
      isLoading: false,
      error: new Error("indexer down"),
    });

    render(<Liquidations />);

    expect(screen.getByTestId("liq-current-price-line")).toBeInTheDocument();
    expect(screen.getByTestId("liq-band-0")).toBeInTheDocument();
    expect(screen.queryAllByTestId("liq-candle")).toHaveLength(0);
  });

  it("renders the live position figures and the chart once a cascade exists", () => {
    connectWallet();
    useDashboardStateMock.mockReturnValue(CONNECTED_WITH_CASCADE);
    usePositionNotificationsMock.mockReturnValue(READY_NOTIFICATIONS);

    render(<Liquidations />);

    expect(
      screen.queryByTestId("liquidations-empty-state"),
    ).not.toBeInTheDocument();
    // Position Overview reads straight from useDashboardState, not a fixture
    // — its USD caption is unique on the page (the analysis header's own
    // "Collateral" stat only ever prints a BTC amount, which can coincide
    // with the position card's BTC value when nothing is liquidated yet).
    expect(
      screen.getByText(
        `${formatUsd(CONNECTED_WITH_CASCADE.collateralValueUsd)} USD`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("liq-current-price-line")).toBeInTheDocument();
    expect(
      screen.getByText(COPY.liquidations.vaultsLiquidated(0, 2)),
    ).toBeInTheDocument();
  });
});

describe("Liquidation Dashboard simulator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBtcPriceCandlesMock.mockReturnValue({
      candles: CANDLES,
      isLoading: false,
      error: null,
    });
    disableGodMode();
    disablePositionOverride();
    connectWallet();
    useDashboardStateMock.mockReturnValue(CONNECTED_WITH_CASCADE);
    usePositionNotificationsMock.mockReturnValue(READY_NOTIFICATIONS);
  });

  it("starts at the live price with nothing liquidated and Reset disabled", () => {
    render(<Liquidations />);

    expect(
      screen.getByText(COPY.liquidations.vaultsLiquidated(0, 2)),
    ).toBeInTheDocument();
    expect(seizedSummary()).toContain("0%");
    expect(resetButton()).toBeDisabled();
    expect(
      screen.queryByText(COPY.liquidations.simulationChip),
    ).not.toBeInTheDocument();
  });

  it("liquidates the events the simulated price has fallen through, without mutating the live result", () => {
    render(<Liquidations />);

    setPrice(secondGroup.liquidationPrice);

    // Both groups are seized at the second group's trigger — 2 of 2 vaults,
    // 100% of collateral.
    expect(
      screen.getByText(COPY.liquidations.vaultsLiquidated(2, 2)),
    ).toBeInTheDocument();
    expect(seizedSummary()).toContain("100%");
    expect(screen.getByText(COPY.liquidations.simulationChip)).toBeVisible();

    fireEvent.click(resetButton());
    expect(
      screen.getByText(COPY.liquidations.vaultsLiquidated(0, 2)),
    ).toBeInTheDocument();
    expect(seizedSummary()).toContain("0%");
  });

  it("clamps an out-of-range entry to the simulator's bounds", () => {
    render(<Liquidations />);

    setPrice(10_000_000);

    expect(resetButton()).toBeDisabled();
    expect(
      screen.getByText(COPY.liquidations.vaultsLiquidated(0, 2)),
    ).toBeInTheDocument();
  });

  it("ignores a blank price entry instead of committing the floor", () => {
    render(<Liquidations />);

    fireEvent.change(priceInput(), { target: { value: "" } });
    fireEvent.blur(priceInput());

    expect(resetButton()).toBeDisabled();
    expect(
      screen.getByText(COPY.liquidations.vaultsLiquidated(0, 2)),
    ).toBeInTheDocument();
  });

  it("ignores a non-numeric price entry instead of committing the floor", () => {
    render(<Liquidations />);

    fireEvent.change(priceInput(), { target: { value: "abc" } });
    fireEvent.blur(priceInput());

    expect(resetButton()).toBeDisabled();
    expect(
      screen.getByText(COPY.liquidations.vaultsLiquidated(0, 2)),
    ).toBeInTheDocument();
  });

  it("aligns the slider's domain so its native step grid always lands on the live price", () => {
    render(<Liquidations />);

    const slider = priceSlider();
    const min = Number(slider.min);
    const max = Number(slider.max);
    const step = Number(slider.step);

    // A native range input only ever lands on `min + n*step` — if the domain
    // isn't aligned, the highest reachable value falls short of `max` and
    // dragging fully right can never clear the simulation.
    const highestReachable = min + Math.floor((max - min) / step) * step;
    expect(highestReachable).toBeCloseTo(max, 6);

    fireEvent.change(slider, { target: { value: String(highestReachable) } });

    expect(resetButton()).toBeDisabled();
    expect(
      screen.queryByText(COPY.liquidations.simulationChip),
    ).not.toBeInTheDocument();
  });

  // `usePrices` refetches every 60s (15s when unhealthy), so resetting on a
  // live-price change would throw away the depositor's what-if about once a
  // minute mid-analysis.
  it("keeps the simulation through a live price refresh instead of discarding it", () => {
    const { rerender } = render(<Liquidations />);

    setPrice(secondGroup.liquidationPrice);
    const seizedWhileSimulating = seizedSummary();
    expect(resetButton()).toBeEnabled();

    // A new oracle round lands: same position, a BTC price that ticked up.
    usePositionNotificationsMock.mockReturnValue({
      ...READY_NOTIFICATIONS,
      params: { ...LIVE_PARAMS, btcPrice: LIVE_PARAMS.btcPrice + 250 },
      result: calculate({
        ...LIVE_PARAMS,
        btcPrice: LIVE_PARAMS.btcPrice + 250,
      }),
    });
    rerender(<Liquidations />);

    expect(seizedSummary()).toBe(seizedWhileSimulating);
    expect(resetButton()).toBeEnabled();
    expect(
      screen.getByText(COPY.liquidations.simulationChip),
    ).toBeInTheDocument();
  });

  // Rounding the span up to a whole step overshoots by up to one step, which
  // lands under zero whenever the lowest trigger is small. A range input takes
  // a negative `min` happily, so a full-left drag would feed a negative price
  // into `calculate()` and paint `$-23.00` on the axis.
  it("never offers a negative price, even with a trigger near zero", () => {
    const params = {
      ...LIVE_PARAMS,
      // Tiny debt against the same collateral puts the only trigger near $0.
      totalDebtUsd: 1,
    };
    usePositionNotificationsMock.mockReturnValue({
      ...READY_NOTIFICATIONS,
      params,
      result: calculate(params),
    });

    render(<Liquidations />);

    expect(Number(priceSlider().min)).toBeGreaterThanOrEqual(0);
  });

  it("returns to the live price on Reset", () => {
    render(<Liquidations />);

    setPrice(firstGroup.liquidationPrice);
    expect(
      screen.getByText(
        COPY.liquidations.vaultsLiquidated(firstGroup.vaults.length, 2),
      ),
    ).toBeInTheDocument();
    expect(resetButton()).toBeEnabled();

    fireEvent.click(resetButton());

    expect(
      screen.getByText(COPY.liquidations.vaultsLiquidated(0, 2)),
    ).toBeInTheDocument();
    expect(resetButton()).toBeDisabled();
  });
});

// A distressed position (HF below the expected-HF floor) puts the whole
// cascade at or above the live price, so there is nothing left to simulate
// down to. `min === max` makes the core-ui Slider divide by a zero span and
// emit a `NaN%` colour stop, which invalidates the whole `background`
// declaration and drops the track fill — broken-looking but still live.
describe("Liquidation Dashboard simulator — nothing left to simulate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBtcPriceCandlesMock.mockReturnValue({
      candles: CANDLES,
      isLoading: false,
      error: null,
    });
    disableGodMode();
    disablePositionOverride();
    connectWallet();
    useDashboardStateMock.mockReturnValue(CONNECTED_WITH_CASCADE);
  });

  it("disables the simulator when the cascade sits at or above the live price", () => {
    // One vault, already underwater: its only trigger is above spot.
    const params: CalculatorParams = {
      ...LIVE_PARAMS,
      btcPrice: 50_000,
      totalDebtUsd: 44_287.72,
      vaults: [{ id: "vault-1", name: "Vault 1", btc: 1 }],
    };
    const result = calculate(params);
    expect(axisFloorPrice(result)).toBeGreaterThan(params.btcPrice);

    usePositionNotificationsMock.mockReturnValue({
      ...READY_NOTIFICATIONS,
      params,
      result,
    });

    render(<Liquidations />);

    const slider = priceSlider();
    expect(slider).toBeDisabled();
    expect(priceInput()).toBeDisabled();
    // Never an inverted domain: that silently pins the thumb instead.
    expect(Number(slider.min)).toBeLessThanOrEqual(Number(slider.max));
  });
});

// `usePositionNotifications` returns `params: null` for `stale-price` and
// `no-price`, so a depositor with a stale oracle reaches this with `isLoading`
// false — previously rendering the position and then nothing at all.
describe("Liquidation Dashboard — no cascade to chart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBtcPriceCandlesMock.mockReturnValue({
      candles: CANDLES,
      isLoading: false,
      error: null,
    });
    disableGodMode();
    disablePositionOverride();
    connectWallet();
    useDashboardStateMock.mockReturnValue(CONNECTED_WITH_CASCADE);
  });

  it("explains itself instead of rendering a half-blank page", () => {
    usePositionNotificationsMock.mockReturnValue({
      ...READY_NOTIFICATIONS,
      result: null,
      params: null,
      status: "stale-price",
    });

    render(<Liquidations />);

    expect(
      screen.getByText(COPY.liquidations.empty.unavailableTitle),
    ).toBeInTheDocument();
    // The position itself does not depend on the price feed, so it stays.
    expect(
      screen.getByText(
        `${formatUsd(CONNECTED_WITH_CASCADE.collateralValueUsd)} USD`,
      ),
    ).toBeInTheDocument();
  });
});

describe("Liquidation Dashboard god mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBtcPriceCandlesMock.mockReturnValue({
      candles: CANDLES,
      isLoading: false,
      error: null,
    });
    enableGodMode();
    disablePositionOverride();
  });

  it("charts the god-mode cascade without a wallet or a real position, bypassing every empty-state gate", () => {
    useConnectionMock.mockReturnValue({ isConnected: false });
    useETHWalletMock.mockReturnValue({ address: undefined });
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_WITH_CASCADE,
      hasCollateral: false,
      hasLoans: false,
    });
    usePositionNotificationsMock.mockReturnValue({
      result: null,
      params: null,
      status: "no-wallet",
      isLoading: false,
      reorderVerificationContext: null,
    });

    render(<Liquidations />);

    expect(
      screen.queryByTestId("liquidations-empty-state"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("liq-current-price-line")).toBeInTheDocument();
    expect(
      screen.getByText(`${formatUsd(GOD_MODE_RESULT.collateralValue)} USD`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        COPY.liquidations.vaultsLiquidated(0, GOD_MODE_RESULT.groups.length),
      ),
    ).toBeInTheDocument();
  });

  it("never shows the real connected position's figures once the god-mode cascade takes over", () => {
    connectWallet();
    useDashboardStateMock.mockReturnValue(CONNECTED_WITH_CASCADE);
    usePositionNotificationsMock.mockReturnValue(READY_NOTIFICATIONS);

    render(<Liquidations />);

    // The safety invariant: a real connected position with real collateral is
    // present in the mocks, but god mode is on, so the live figures (from
    // useDashboardState / usePositionNotifications) must never render —
    // showing them here would be presenting a fabricated cascade above real
    // collateral.
    expect(
      screen.queryByText(
        `${formatUsd(CONNECTED_WITH_CASCADE.collateralValueUsd)} USD`,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.liquidations.vaultsLiquidated(0, 2)),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(`${formatUsd(GOD_MODE_RESULT.collateralValue)} USD`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        COPY.liquidations.vaultsLiquidated(0, GOD_MODE_RESULT.groups.length),
      ),
    ).toBeInTheDocument();
  });
});

describe("Liquidation Dashboard position override", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBtcPriceCandlesMock.mockReturnValue({
      candles: CANDLES,
      isLoading: false,
      error: null,
    });
    disableGodMode();
    connectWallet();
    useDashboardStateMock.mockReturnValue(CONNECTED_WITH_CASCADE);
    usePositionNotificationsMock.mockReturnValue(READY_NOTIFICATIONS);
  });

  it("renders the override's own stat-card figures, never the live position's", () => {
    enablePositionOverride();

    render(<Liquidations />);

    expect(
      screen.getByText(formatBtcAmount(POSITION_OVERRIDE.collateralBtc)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${formatUsd(POSITION_OVERRIDE.debtUsd)} USD`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(formatHealthFactor(POSITION_OVERRIDE.healthFactor)),
    ).toBeInTheDocument();
    // No live figure leaks in.
    expect(
      screen.queryByText(
        `${formatUsd(CONNECTED_WITH_CASCADE.collateralValueUsd)} USD`,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        formatHealthFactor(CONNECTED_WITH_CASCADE.healthFactor),
      ),
    ).not.toBeInTheDocument();
  });

  it("renders the live position's figures once disabled — no mock leak", () => {
    disablePositionOverride();

    render(<Liquidations />);

    expect(
      screen.getByText(
        `${formatUsd(CONNECTED_WITH_CASCADE.collateralValueUsd)} USD`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(formatHealthFactor(CONNECTED_WITH_CASCADE.healthFactor)),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(`${formatUsd(POSITION_OVERRIDE.debtUsd)} USD`),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(formatHealthFactor(POSITION_OVERRIDE.healthFactor)),
    ).not.toBeInTheDocument();
  });

  it("derives the USD caption from the override and the live BTC price", () => {
    const override: LiquidationPositionOverride = {
      collateralBtc: 2,
      debtUsd: 44_287.72,
      healthFactor: 1.1,
    };
    useLiquidationPositionOverrideMock.mockReturnValue(override);

    render(<Liquidations />);

    expect(
      screen.getByText(
        `${formatUsd(override.collateralBtc * LIVE_PARAMS.btcPrice)} USD`,
      ),
    ).toBeInTheDocument();
  });

  it("leaves the USD caption absent (not a fabricated $0.00) when no BTC price is available", () => {
    useConnectionMock.mockReturnValue({ isConnected: false });
    useETHWalletMock.mockReturnValue({ address: undefined });
    usePositionNotificationsMock.mockReturnValue({
      ...READY_NOTIFICATIONS,
      result: null,
      params: null,
      status: "no-wallet",
    });
    enablePositionOverride();

    render(<Liquidations />);

    expect(
      screen.getByText(formatBtcAmount(POSITION_OVERRIDE.collateralBtc)),
    ).toBeInTheDocument();
    expect(screen.queryByText("$0.00 USD")).not.toBeInTheDocument();
  });

  it("wins for the stat cards over an active god-mode cascade, which keeps driving the chart", () => {
    enableGodMode();
    enablePositionOverride();

    render(<Liquidations />);

    // Stat cards: the position override, not the cascade's own derived figures.
    expect(
      screen.getByText(formatBtcAmount(POSITION_OVERRIDE.collateralBtc)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${formatUsd(POSITION_OVERRIDE.debtUsd)} USD`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(formatHealthFactor(POSITION_OVERRIDE.healthFactor)),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(`${formatUsd(GOD_MODE_RESULT.collateralValue)} USD`),
    ).not.toBeInTheDocument();
    // Chart: still the god-mode cascade, independent of the stat-card override.
    expect(screen.getByTestId("liq-current-price-line")).toBeInTheDocument();
    expect(
      screen.getByText(
        COPY.liquidations.vaultsLiquidated(0, GOD_MODE_RESULT.groups.length),
      ),
    ).toBeInTheDocument();
  });
});
