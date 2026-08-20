import { describe, expect, it } from "vitest";

import type { ActivityLog, LiquidationGroupRow } from "@/types/activityLog";

import { activityRowMatchesSearch } from "../activitySearch";

const row: ActivityLog = {
  kind: "row",
  id: "a",
  date: new Date(2025, 8, 8, 14, 0, 0),
  type: "Borrow",
  amount: { value: "100", symbol: "USDC" },
  chain: "ETH",
  transactionHash: "0xDEADBEEF",
  tokenIcon: "test://usdc.svg",
};

const group: LiquidationGroupRow = {
  kind: "liquidationGroup",
  id: "g",
  date: new Date(2025, 8, 8, 12, 0, 0),
  type: "Fully Liquidated",
  tokenIcons: ["test://btc.svg", "test://usdc.svg"],
  summary: {
    collateral: { value: "0.5", symbol: "BTC" },
    debt: { value: "10,000", symbol: "USDC" },
  },
  transactionHash: "0xaaa1",
  children: [
    {
      id: "c1",
      label: "Debt repaid",
      amount: { value: "10,000", symbol: "USDC" },
      tokenIcon: "test://usdc.svg",
      chain: "ETH",
      transactionHash: "0xchildhash",
      date: new Date(2025, 8, 8, 12, 0, 0),
    },
  ],
};

describe("activityRowMatchesSearch", () => {
  it("matches every row on an empty query", () => {
    expect(activityRowMatchesSearch(row, "")).toBe(true);
  });

  it("matches on the visible type label", () => {
    expect(activityRowMatchesSearch(row, "borrow")).toBe(true);
    expect(activityRowMatchesSearch(row, "deposit")).toBe(false);
  });

  it("matches a hash pasted with or without its 0x prefix", () => {
    expect(activityRowMatchesSearch(row, "deadbeef")).toBe(true);
    expect(activityRowMatchesSearch(row, "0xdeadbeef")).toBe(true);
  });

  it("matches a liquidation group on a child's label or hash", () => {
    expect(activityRowMatchesSearch(group, "debt repaid")).toBe(true);
    expect(activityRowMatchesSearch(group, "childhash")).toBe(true);
    expect(activityRowMatchesSearch(group, "unrelated")).toBe(false);
  });

  it("matches a liquidation group on its own type label", () => {
    expect(activityRowMatchesSearch(group, "fully liquidated")).toBe(true);
  });
});
