import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { LiquidationAnalysisSection } from "../LiquidationAnalysisSection";

function renderSection(props: {
  hasCollateral: boolean;
  hasLoans: boolean;
  onDeposit?: () => void;
  onBorrow?: () => void;
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

  it("shows the chart once there is debt to liquidate", () => {
    renderSection({ hasCollateral: true, hasLoans: true });

    expect(
      screen.getByText(COPY.liquidations.simulateLabel),
    ).toBeInTheDocument();
    expect(screen.getByTestId("liq-current-price-line")).toBeInTheDocument();
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
