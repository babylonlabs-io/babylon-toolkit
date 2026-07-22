import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ActivityLog } from "@/types/activityLog";

import { ActivityRowV3 } from "../ActivityRowV3";

const FULL_HASH =
  "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";

const baseRow: ActivityLog = {
  kind: "row",
  id: "tx-1",
  date: new Date(2025, 8, 8, 14, 32, 7), // Sep 8, 2025 14:32:07 local
  type: "Deposit",
  amount: { value: "1.0", symbol: "BTC" },
  chain: "BTC",
  transactionHash: FULL_HASH,
  tokenIcon: "test://btc.svg",
};

describe("ActivityRowV3", () => {
  it("renders amount, type, tx-hash link, and a time-only timestamp", () => {
    render(<ActivityRowV3 row={baseRow} />);

    expect(screen.getByText("1.0 BTC")).toBeInTheDocument();
    expect(screen.getByText("Deposit")).toBeInTheDocument();

    const anchor = screen.getByRole("link");
    expect(anchor).toHaveAttribute("href", expect.stringContaining(FULL_HASH));

    // Time only — the calendar day lives in the group header, not the row.
    expect(screen.getByText("14:32:07")).toBeInTheDocument();
    expect(screen.queryByText(/2025-09-08/)).not.toBeInTheDocument();
  });

  it("shows 'In use' for a settled deposit", () => {
    render(<ActivityRowV3 row={baseRow} />);

    expect(screen.getByText("In use")).toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
    expect(screen.queryByText("Expired")).not.toBeInTheDocument();
  });

  it("shows 'Done' for a settled borrow / repay", () => {
    render(<ActivityRowV3 row={{ ...baseRow, type: "Borrow" }} />);
    expect(screen.getByText("Done")).toBeInTheDocument();

    render(<ActivityRowV3 row={{ ...baseRow, id: "r2", type: "Repay" }} />);
    expect(screen.getAllByText("Done").length).toBeGreaterThan(0);
  });

  it("shows a Pending status for a pending row", () => {
    render(<ActivityRowV3 row={{ ...baseRow, isPending: true }} />);

    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("Expired")).not.toBeInTheDocument();
  });

  it("shows an Expired status for an expired row", () => {
    render(<ActivityRowV3 row={{ ...baseRow, isExpired: true }} />);

    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("shows Expired (not Pending) when a row is both pending and expired", () => {
    render(
      <ActivityRowV3 row={{ ...baseRow, isPending: true, isExpired: true }} />,
    );

    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });

  it("renders the pending placeholder instead of a link when there is no hash", () => {
    render(
      <ActivityRowV3
        row={{ ...baseRow, isPending: true, transactionHash: "" }}
      />,
    );

    expect(screen.getByText("Pending…")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
