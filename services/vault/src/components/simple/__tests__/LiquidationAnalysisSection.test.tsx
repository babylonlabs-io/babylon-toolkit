import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { CalculatorResult } from "@/applications/aave/positionNotifications/types";
import { COPY } from "@/copy";

import {
  LiquidationAnalysisSection,
  type LiquidationCascade,
} from "../LiquidationAnalysisSection";

const CASCADE: LiquidationCascade = {
  btcPrice: 88_400,
  collateralFactor: 0.5,
  result: {
    groups: [
      {
        index: 0,
        vaults: [{ id: "v-1", name: "Vault 1", btc: 0.6 }],
        combinedBtc: 0.6,
        liquidationPrice: 77_682,
        distancePct: -12.1,
        targetSeizureBtc: 0.58,
        overSeizureBtc: 0.02,
        isFullLiquidation: true,
        debtToRepay: 28_383,
        liquidatorProfitUsd: 1_419,
        debtRepaid: 28_383,
        fairnessDebtRepay: 0,
        fairnessPaymentUsd: 798,
        debtRemainingAfter: 0,
        btcRemainingAfter: 0,
      },
    ],
    currentHF: 1.1,
    collateralValue: 53_040,
    targetSeizureBtc: 0.58,
    warnings: [],
    optimalVaultOrder: null,
    suggestedNewVaultBtc: null,
  } satisfies CalculatorResult,
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
    expect(slider).toHaveValue(String(CASCADE.btcPrice));
    expect(slider).toHaveAttribute("max", String(CASCADE.btcPrice));
    expect(slider).toHaveAttribute("min", "0");
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

    expect(slider).toHaveValue(String(CASCADE.btcPrice));
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
});
