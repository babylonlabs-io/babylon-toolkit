import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ActivityLog } from "../../../types/activityLog";
import { ActivityCard } from "../ActivityCard";

const FULL_HASH =
  "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";

const baseRow: ActivityLog = {
  id: "tx-1-0-deposit",
  date: new Date("2025-10-16T11:48:47Z"),
  type: "Deposit",
  amount: { value: "1", symbol: "BTC" },
  chain: "BTC",
  transactionHash: FULL_HASH,
  tokenIcon: "test://btc.svg",
};

describe("ActivityCard", () => {
  it("renders title, truncated hash anchor, amount, and date for a completed row", () => {
    render(<ActivityCard row={baseRow} />);

    expect(screen.getByText("Deposit")).toBeInTheDocument();

    const anchor = screen.getByRole("link");
    expect(anchor).toHaveAttribute("href", expect.stringContaining(FULL_HASH));
    expect(anchor).toHaveAttribute("target", "_blank");
    expect(anchor.textContent).toBe("a1b2c3...a1b2");

    expect(screen.getByText("1 BTC")).toBeInTheDocument();
    expect(screen.getByText(/2025-10-16/)).toBeInTheDocument();
  });

  it("renders spinner and 'Pending…' instead of a link when isPending", () => {
    render(
      <ActivityCard
        row={{ ...baseRow, isPending: true, transactionHash: "" }}
      />,
    );

    expect(screen.getByText("Pending…")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByTestId("activity-card-spinner")).toBeInTheDocument();
  });

  it("renders the red refund dot with accessible tooltip when isRefunded", () => {
    render(<ActivityCard row={{ ...baseRow, isRefunded: true }} />);

    expect(
      screen.getByLabelText("Transaction was refunded"),
    ).toBeInTheDocument();
  });

  it("treats refunded as exclusive with pending (refunded wins)", () => {
    render(
      <ActivityCard row={{ ...baseRow, isPending: true, isRefunded: true }} />,
    );

    expect(
      screen.queryByTestId("activity-card-spinner"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Transaction was refunded"),
    ).toBeInTheDocument();
  });

  it("copy button writes the full un-truncated hash to clipboard", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ActivityCard row={baseRow} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    expect(writeText).toHaveBeenCalledWith(FULL_HASH);
  });
});
