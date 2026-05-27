import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LiquidationGroupRow } from "../../../types/activityLog";
import { LiquidationGroupCard } from "../LiquidationGroupCard";

const row: LiquidationGroupRow = {
  kind: "liquidationGroup",
  id: "tx-1-0-liquidation",
  date: new Date("2025-10-16T11:48:47Z"),
  type: "Partially Liquidated",
  tokenIcons: ["test://btc.svg", "test://usdc.svg"],
  summary: {
    collateral: { value: "0.5", symbol: "BTC" },
    debt: { value: "10,000", symbol: "USDC" },
  },
  children: [
    {
      id: "tx-1-0-liquidation-collateral",
      label: "Collateral Liquidated",
      amount: { value: "0.5", symbol: "BTC" },
      tokenIcon: "test://btc.svg",
      chain: "ETH",
      transactionHash:
        "0xabc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abc",
      date: new Date("2025-10-16T11:48:47Z"),
    },
    {
      id: "tx-1-1-repay-loan",
      label: "Loan Repaid",
      amount: { value: "10,000", symbol: "USDC" },
      tokenIcon: "test://usdc.svg",
      chain: "ETH",
      transactionHash:
        "0xabc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abc",
      date: new Date("2025-10-16T11:48:47Z"),
    },
  ],
  transactionHash:
    "0xabc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abc",
};

describe("LiquidationGroupCard", () => {
  it("renders the classification title and the collateral/debt summary", () => {
    render(<LiquidationGroupCard row={row} />);
    expect(screen.getByText("Partially Liquidated")).toBeInTheDocument();
    expect(screen.getByText("0.5 BTC / 10,000 USDC")).toBeInTheDocument();
  });

  it("hides the children until the expand toggle is clicked", () => {
    render(<LiquidationGroupCard row={row} />);
    expect(screen.queryByText("Collateral Liquidated")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    expect(screen.getByText("Collateral Liquidated")).toBeInTheDocument();
    expect(screen.getByText("Loan Repaid")).toBeInTheDocument();
  });

  it("collapses the children when the toggle is clicked again", () => {
    render(<LiquidationGroupCard row={row} />);
    const trigger = screen.getByRole("button", { name: /expand/i });
    fireEvent.click(trigger);
    expect(screen.getByText("Loan Repaid")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /collapse/i }));
    expect(screen.queryByText("Loan Repaid")).not.toBeInTheDocument();
  });

  it("renders the summary without a debt line when no repay child is present", () => {
    const noDebt: LiquidationGroupRow = {
      ...row,
      summary: { collateral: row.summary.collateral, debt: null },
      children: [row.children[0]],
    };
    render(<LiquidationGroupCard row={noDebt} />);
    expect(screen.getByText("0.5 BTC")).toBeInTheDocument();
    expect(screen.queryByText("/")).not.toBeInTheDocument();
  });
});
