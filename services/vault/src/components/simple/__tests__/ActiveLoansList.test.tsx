import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ActiveLoanRow } from "@/applications/aave/hooks";

import { ActiveLoansList } from "../ActiveLoansList";

function makeRow(overrides: Partial<ActiveLoanRow> = {}): ActiveLoanRow {
  return {
    reserveId: "1",
    symbol: "USDC",
    name: "USD Coin",
    amount: "1.00",
    icon: "https://example.com/usdc.svg",
    borrowRate: "5.861%",
    availableLiquidity: 1000,
    utilizationBps: 5000,
    isBorrowable: true,
    ...overrides,
  };
}

describe("ActiveLoansList — per-row Borrow gating", () => {
  it("disables the Borrow button for a non-borrowable reserve while keeping Repay enabled", () => {
    render(
      <ActiveLoansList
        rows={[makeRow({ isBorrowable: false })]}
        canBorrow
        onBorrow={vi.fn()}
        onRepay={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Borrow" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Repay" })).toBeEnabled();
  });

  it("enables the Borrow button for a borrowable reserve when capacity remains", () => {
    render(
      <ActiveLoansList
        rows={[makeRow({ isBorrowable: true })]}
        canBorrow
        onBorrow={vi.fn()}
        onRepay={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Borrow" })).toBeEnabled();
  });

  it("disables the Borrow button when there is no borrow capacity, even for a borrowable reserve", () => {
    render(
      <ActiveLoansList
        rows={[makeRow({ isBorrowable: true })]}
        canBorrow={false}
        onBorrow={vi.fn()}
        onRepay={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Borrow" })).toBeDisabled();
  });
});
