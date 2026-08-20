import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LiquidationGroupRow } from "@/types/activityLog";

vi.mock("@/config", () => ({
  getNetworkConfigBTC: () => ({ coinSymbol: "sBTC" }),
  getBTCNetwork: () => "signet",
}));

import { LiquidationGroupCardV3 } from "../LiquidationGroupCardV3";

const group: LiquidationGroupRow = {
  kind: "liquidationGroup",
  id: "g",
  date: new Date(2025, 8, 8, 12, 18, 53),
  type: "Fully Liquidated",
  tokenIcons: ["test://btc.svg", "test://usdc.svg"],
  summary: {
    collateral: { value: "1.0", symbol: "BTC" },
    debt: { value: "10,000", symbol: "USDC" },
  },
  transactionHash: "0xaaa1",
  children: [
    {
      id: "c1",
      label: "Liquidated",
      amount: { value: "1.0", symbol: "BTC", numeric: 1 },
      tokenIcon: "test://btc.svg",
      chain: "BTC",
      transactionHash: "0xbbb1",
      date: new Date(2025, 8, 8, 12, 18, 53),
    },
    {
      id: "c2",
      label: "Debt repaid",
      amount: { value: "10,000", symbol: "USDC", numeric: 10_000 },
      tokenIcon: "test://usdc.svg",
      chain: "ETH",
      transactionHash: "0xccc1",
      date: new Date(2025, 8, 8, 11, 7, 41),
    },
  ],
};

describe("LiquidationGroupCardV3", () => {
  it("renders each child event with its own label, amount and time", () => {
    render(<LiquidationGroupCardV3 row={group} />);

    expect(screen.getByText("Liquidated")).toBeInTheDocument();
    expect(screen.getByText("Debt repaid")).toBeInTheDocument();
    expect(screen.getByText("1.0 BTC")).toBeInTheDocument();
    expect(screen.getByText("10,000 USDC")).toBeInTheDocument();
    expect(screen.getByText("12:18:53")).toBeInTheDocument();
    expect(screen.getByText("11:07:41")).toBeInTheDocument();
  });

  it("prices each child independently", () => {
    render(
      <LiquidationGroupCardV3 row={group} prices={{ BTC: 90_000, USDC: 1 }} />,
    );

    expect(screen.getByText("$90,000.00 USD")).toBeInTheDocument();
    expect(screen.getByText("$10,000.00 USD")).toBeInTheDocument();
  });

  it("renders no status label — the design dropped that column", () => {
    render(<LiquidationGroupCardV3 row={group} />);

    expect(screen.queryByText("Fully Liquidated")).not.toBeInTheDocument();
  });
});
