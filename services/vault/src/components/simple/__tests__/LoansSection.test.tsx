import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/Wallet", () => ({
  Connect: () => <button>Connect</button>,
}));

import { LoansSection } from "../LoansSection";

const baseProps = {
  hasLoans: true,
  hasCollateral: true,
  isConnected: true,
  borrowedAssets: [{ symbol: "USDC", amount: "100", icon: "/usdc.png" }],
  debtDiscoveryFailed: false,
  onBorrow: vi.fn(),
  onRepay: vi.fn(),
};

describe("LoansSection", () => {
  it("renders the borrowed-assets list when discovery succeeded", () => {
    render(<LoansSection {...baseProps} />);

    expect(screen.getByText(/100 USDC/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Cannot determine your full debt/),
    ).not.toBeInTheDocument();
  });

  it("renders blocking banner and disables both action buttons when discovery failed", () => {
    render(<LoansSection {...baseProps} debtDiscoveryFailed={true} />);

    expect(
      screen.getByText(/Cannot determine your full debt/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/100 USDC/)).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Borrow" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Repay" })).toBeDisabled();
  });

  it("forces the Repay button to render when discovery failed even without loans", () => {
    render(
      <LoansSection
        {...baseProps}
        hasLoans={false}
        debtDiscoveryFailed={true}
      />,
    );

    expect(screen.getByRole("button", { name: "Repay" })).toBeDisabled();
  });

  it("disables Borrow when collateral is missing even if discovery succeeded", () => {
    render(<LoansSection {...baseProps} hasCollateral={false} />);

    expect(screen.getByRole("button", { name: "Borrow" })).toBeDisabled();
  });
});
