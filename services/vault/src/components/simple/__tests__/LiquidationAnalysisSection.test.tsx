import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { calculate } from "@/applications/aave/positionNotifications";
import type { CalculatorParams } from "@/applications/aave/positionNotifications/types";
import { COPY } from "@/copy";

import {
  LiquidationAnalysisSection,
  type LiquidationCascade,
} from "../LiquidationAnalysisSection";

/**
 * A real single-vault position: 0.6 BTC at $88,400 against $22,000 of debt,
 * CF 0.5. `calculate()` puts its one liquidation trigger at $73,333, so the
 * position opens healthy and a drag below that trigger liquidates it. The
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

function renderSection(props: {
  hasCollateral: boolean;
  hasLoans: boolean;
  onDeposit?: () => void;
  onBorrow?: () => void;
  cascade?: LiquidationCascade | null;
}) {
  return render(
    <MemoryRouter>
      <LiquidationAnalysisSection
        onDeposit={vi.fn()}
        onBorrow={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("LiquidationAnalysisSection", () => {
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

  it("shows the chart once there is debt and a cascade to chart it from", () => {
    renderSection({ hasCollateral: true, hasLoans: true, cascade: CASCADE });

    expect(
      screen.getByText(COPY.liquidations.simulateLabel),
    ).toBeInTheDocument();
    expect(screen.getByTestId("liq-current-price-line")).toBeInTheDocument();
  });

  it("opens at the live price with nothing seized and no simulation chip", () => {
    renderSection({ hasCollateral: true, hasLoans: true, cascade: CASCADE });

    expect(
      screen.getByText(COPY.liquidations.vaultsLiquidated(0, 1)),
    ).toBeInTheDocument();
    expect(screen.getByTestId("liq-seized-pct")).toHaveTextContent("0%");
    expect(screen.queryByText(COPY.liquidations.simulationChip)).toBeNull();
    expect(
      screen.getByRole("button", { name: COPY.liquidations.reset }),
    ).toBeDisabled();
    const slider = screen.getByRole("slider", {
      name: COPY.liquidations.simulateLabel,
    });
    expect(slider).toHaveValue(String(PARAMS.btcPrice));
    expect(slider).toHaveAttribute("max", String(PARAMS.btcPrice));
    expect(slider).toHaveAttribute("min", "0");
    // Step 1: a coarser grid cannot land back on the float live price, which
    // would leave the simulator stuck in "simulating" after a full drag right.
    expect(slider).toHaveAttribute("step", "1");
  });

  it("liquidates the event live as the price is dragged through its trigger", () => {
    renderSection({ hasCollateral: true, hasLoans: true, cascade: CASCADE });

    fireEvent.change(
      screen.getByRole("slider", { name: COPY.liquidations.simulateLabel }),
      { target: { value: "60000" } },
    );

    // Header figures follow the simulation.
    expect(
      screen.getByText(COPY.liquidations.vaultsLiquidated(1, 1)),
    ).toBeInTheDocument();
    expect(screen.getByTestId("liq-seized-pct")).toHaveTextContent("100%");
    expect(
      screen.getByText(COPY.liquidations.simulationChip),
    ).toBeInTheDocument();
    // The event card flips to its simulated-liquidation state.
    expect(
      screen.getByText(COPY.liquidations.events.liquidatedInSimulation),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.liquidations.events.badgeSacrificial),
    ).toBeNull();
  });

  it("returns to the live view on reset", () => {
    renderSection({ hasCollateral: true, hasLoans: true, cascade: CASCADE });

    const slider = screen.getByRole("slider", {
      name: COPY.liquidations.simulateLabel,
    });
    fireEvent.change(slider, { target: { value: "60000" } });
    fireEvent.click(
      screen.getByRole("button", { name: COPY.liquidations.reset }),
    );

    expect(slider).toHaveValue(String(PARAMS.btcPrice));
    expect(screen.queryByText(COPY.liquidations.simulationChip)).toBeNull();
    expect(
      screen.queryByText(COPY.liquidations.events.liquidatedInSimulation),
    ).toBeNull();
    expect(
      screen.getByText(COPY.liquidations.events.badgeSacrificial),
    ).toBeInTheDocument();
  });

  it("renders the event card sections from the cascade", () => {
    renderSection({ hasCollateral: true, hasLoans: true, cascade: CASCADE });

    expect(
      screen.getByText(COPY.liquidations.events.heading),
    ).toBeInTheDocument();
    const cards = within(screen.getByTestId("liq-event-cards"));
    expect(
      cards.getByText(COPY.liquidations.eventTitle(1)),
    ).toBeInTheDocument();
    expect(
      cards.getByText(COPY.liquidations.events.badgeSacrificial),
    ).toBeInTheDocument();
    expect(
      cards.getByText(COPY.liquidations.events.positionAfterSection),
    ).toBeInTheDocument();
    // Full-liquidation groups show the wBTC fairness payment row.
    expect(
      screen.getByText(COPY.liquidations.events.fairnessPaymentWbtc),
    ).toBeInTheDocument();
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

  // The distance a liquidation event reports is measured from the price the
  // cascade was calculated at. Re-projecting the live-price cascade onto a
  // dragged price keeps the live distance (-17.0% here) while the band already
  // reads as liquidated; re-running `calculate()` at the dragged price reports
  // the price as 22.2% PAST the trigger. Only the recomputed figure is
  // consistent with the band beside it.
  it("recalculates the cascade at the simulated price rather than reprojecting the live one", () => {
    renderSection({ hasCollateral: true, hasLoans: true, cascade: CASCADE });

    fireEvent.change(
      screen.getByRole("slider", { name: COPY.liquidations.simulateLabel }),
      { target: { value: "60000" } },
    );

    const cards = within(screen.getByTestId("liq-event-cards"));
    expect(cards.getByText("+22.2%")).toBeInTheDocument();
    expect(cards.queryByText("-17.0%")).toBeNull();
  });

  it("charts nothing when the cascade has no groups to seize", () => {
    renderSection({
      hasCollateral: true,
      hasLoans: true,
      cascade: INVALID_CASCADE,
    });

    expect(INVALID_CASCADE.result.groups).toHaveLength(0);
    expect(screen.queryByText(COPY.liquidations.simulateLabel)).toBeNull();
    expect(screen.queryByTestId("liq-event-cards")).toBeNull();
    expect(screen.queryByTestId("liq-seized-pct")).toBeNull();
  });
});
