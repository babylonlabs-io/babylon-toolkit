import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { calculate } from "@/applications/aave/positionNotifications";
import type { CalculatorParams } from "@/applications/aave/positionNotifications/types";
import { COPY } from "@/copy";
import { ROUTES } from "@/routes";

import {
  LiquidationAnalysisSection,
  type LiquidationCascade,
} from "../LiquidationAnalysisSection";

/**
 * The candle series is the one Aave-scoped data hook this section owns, so it
 * is mocked at the module boundary; the chart projection and core-ui's
 * `Timeline` run for real.
 */
const useBtcPriceCandlesMock = vi.fn();

vi.mock("@/applications/aave/hooks/useBtcPriceCandles", () => ({
  useBtcPriceCandles: () => useBtcPriceCandlesMock(),
}));

const CANDLES = Array.from({ length: 30 }, (_, i) => ({
  time: Date.UTC(2026, 4, 5) + i * 86_400_000,
  open: 86_000,
  high: 92_000,
  low: 84_000,
  close: 88_000,
}));

/**
 * A real single-vault position: 0.6 BTC at $88,400 against $22,000 of debt,
 * CF 0.5. `calculate()` puts its one liquidation trigger at $73,333, so the
 * position opens healthy and a drop below that trigger liquidates it. The
 * result is real calculator output, never hand-built, so the fixture cannot
 * drift from the maths the component re-runs.
 */
const PARAMS: CalculatorParams = {
  btcPrice: 88_400,
  totalDebtUsd: 22_000,
  vaults: [{ id: "v-1", name: "Vault 1", btc: 0.6 }],
  CF: 0.5,
  THF: 1.1,
  maxLB: 1.05,
};
const CASCADE: LiquidationCascade = {
  result: calculate(PARAMS),
  params: PARAMS,
};

/** Governance params whose seizure fraction clamps out of range: `calculate()`
 *  returns no groups while the debt is still there. */
const INVALID_PARAMS: CalculatorParams = { ...PARAMS, CF: 0.92 };
const INVALID_CASCADE: LiquidationCascade = {
  result: calculate(INVALID_PARAMS),
  params: INVALID_PARAMS,
};

const LIQUIDATIONS_PAGE_MARKER = "liquidations page";

function renderSection(props: {
  hasCollateral: boolean;
  hasLoans: boolean;
  onDeposit?: () => void;
  onBorrow?: () => void;
  cascade?: LiquidationCascade | null;
}) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route
          path="/"
          element={
            <LiquidationAnalysisSection
              onDeposit={vi.fn()}
              onBorrow={vi.fn()}
              {...props}
            />
          }
        />
        <Route
          path={ROUTES.LIQUIDATIONS}
          element={<div>{LIQUIDATIONS_PAGE_MARKER}</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LiquidationAnalysisSection", () => {
  beforeEach(() => {
    useBtcPriceCandlesMock.mockReturnValue({
      candles: CANDLES,
      isLoading: false,
      error: null,
    });
  });

  it("prompts for a deposit before any collateral exists", () => {
    renderSection({ hasCollateral: false, hasLoans: false });

    expect(
      screen.getByText(COPY.liquidations.empty.noDepositTitle),
    ).toBeInTheDocument();
    expect(screen.queryByText(COPY.liquidations.simulateLabel)).toBeNull();
  });

  it("prompts to borrow once collateral exists but no loan does", () => {
    renderSection({ hasCollateral: true, hasLoans: false });

    expect(
      screen.getByText(COPY.liquidations.empty.noLoanTitle),
    ).toBeInTheDocument();
    expect(screen.queryByText(COPY.liquidations.simulateLabel)).toBeNull();
  });

  it("charts the price timeline once there is debt and a cascade", () => {
    renderSection({ hasCollateral: true, hasLoans: true, cascade: CASCADE });

    expect(
      screen.getByText(COPY.liquidations.simulateLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.liquidations.simulateDescription),
    ).toBeInTheDocument();
    expect(screen.getByTestId("liq-current-price-line")).toBeInTheDocument();
    expect(screen.getAllByTestId("liq-candle")).toHaveLength(CANDLES.length);
  });

  it("labels the safe zone from the first trigger and the live price", () => {
    renderSection({ hasCollateral: true, hasLoans: true, cascade: CASCADE });

    expect(
      screen.getByText(COPY.liquidations.safeZone.title),
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.liquidations.safeZone.noEventsAbove("$73,333")),
    ).toBeInTheDocument();
    // (88,400 - 73,333.33) / 88,400 = 17.0%
    expect(
      screen.getByText(COPY.liquidations.safeZone.dropToFirstEvent("17.0")),
    ).toBeInTheDocument();
  });

  // The preview is read-only: simulating a price is what Explore is for.
  it("shows no simulator controls", () => {
    renderSection({ hasCollateral: true, hasLoans: true, cascade: CASCADE });

    expect(screen.queryByRole("slider")).toBeNull();
    expect(
      screen.queryByRole("button", { name: COPY.liquidations.reset }),
    ).toBeNull();
  });

  it("opens the liquidations page from Explore", () => {
    renderSection({ hasCollateral: true, hasLoans: true, cascade: CASCADE });

    fireEvent.click(
      screen.getByRole("button", { name: COPY.liquidations.exploreAction }),
    );

    expect(screen.getByText(LIQUIDATIONS_PAGE_MARKER)).toBeInTheDocument();
  });

  // The series is a separate request from the cascade, so the frame has to
  // stand on its own while it is missing.
  it("still renders the chart frame with no candle series", () => {
    useBtcPriceCandlesMock.mockReturnValue({
      candles: null,
      isLoading: false,
      error: new Error("indexer down"),
    });

    renderSection({ hasCollateral: true, hasLoans: true, cascade: CASCADE });

    expect(screen.getByTestId("liq-current-price-line")).toBeInTheDocument();
    expect(screen.getByTestId("liq-band-0")).toBeInTheDocument();
    expect(screen.queryAllByTestId("liq-candle")).toHaveLength(0);
  });

  it("opens the event tooltip on band hover", () => {
    renderSection({ hasCollateral: true, hasLoans: true, cascade: CASCADE });

    fireEvent.mouseEnter(screen.getByTestId("liq-band-0"));

    expect(
      screen.getByText(COPY.liquidations.popover.atPrice),
    ).toBeInTheDocument();
  });

  // A position must never be charted from stand-in numbers, so with no cascade
  // the section renders nothing rather than an empty frame.
  it("renders nothing for a real position with no cascade", () => {
    const { container } = renderSection({
      hasCollateral: true,
      hasLoans: true,
    });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(COPY.liquidations.heading)).toBeNull();
  });

  // Regression: passing the handler by reference hands it React's click event,
  // which reaches `openDeposit`'s optional amount and crashes the dialog.
  it("calls the deposit handler with no arguments", () => {
    const onDeposit = vi.fn();
    renderSection({ hasCollateral: false, hasLoans: false, onDeposit });

    fireEvent.click(
      screen.getByRole("button", { name: COPY.liquidations.position.deposit }),
    );

    expect(onDeposit).toHaveBeenCalledWith();
  });

  it("calls the borrow handler with no arguments", () => {
    const onBorrow = vi.fn();
    renderSection({ hasCollateral: true, hasLoans: false, onBorrow });

    fireEvent.click(
      screen.getByRole("button", { name: COPY.liquidations.empty.borrow }),
    );

    expect(onBorrow).toHaveBeenCalledWith();
  });

  it("charts nothing when the cascade has no groups to seize", () => {
    const { container } = renderSection({
      hasCollateral: true,
      hasLoans: true,
      cascade: INVALID_CASCADE,
    });

    expect(INVALID_CASCADE.result.groups).toHaveLength(0);
    expect(container).toBeEmptyDOMElement();
  });
});
