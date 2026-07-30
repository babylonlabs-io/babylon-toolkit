/**
 * BorrowMarketsTable — renders one row per market with pre-formatted labels,
 * hides the utilization meter when the ratio is unavailable, clamps an
 * out-of-range ratio to a full meter, and shows the empty-state copy when
 * there are no rows.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Component tests mock core-ui (its dist isn't built in the test run).
vi.mock("@babylonlabs-io/core-ui", () => ({
  Avatar: ({ alt }: { alt: string }) => <img alt={alt} />,
  Hint: () => null,
}));

import {
  BorrowMarketsTable,
  type BorrowMarketRow,
} from "../BorrowMarketsTable";

const baseRow: BorrowMarketRow = {
  reserveId: "1",
  symbol: "USDC",
  name: "USD Coin",
  icon: "usdc.png",
  aprLabel: "3.70%",
  availableLabel: "45.2K USDC",
  utilizationLabel: "25%",
  utilizationRatio: 0.25,
  borrowedUsdLabel: "$1.2M",
  borrowedTokenLabel: "1.2M USDC",
  suppliedUsdLabel: "$4.8M",
  suppliedTokenLabel: "4.8M USDC",
};

describe("BorrowMarketsTable", () => {
  it("renders one row per entry with its formatted labels", () => {
    render(<BorrowMarketsTable rows={[baseRow]} />);

    expect(screen.getByTestId("borrow-market-row-USDC")).toBeInTheDocument();
    expect(screen.getByText("USD Coin")).toBeInTheDocument();
    expect(screen.getByText("USDC")).toBeInTheDocument();
    expect(screen.getByText("3.70%")).toBeInTheDocument();
    expect(screen.getByText("45.2K USDC")).toBeInTheDocument();
    expect(screen.getByText("1.2M USDC")).toBeInTheDocument();
    expect(screen.getByText("4.8M USDC")).toBeInTheDocument();
  });

  it("renders every column header", () => {
    render(<BorrowMarketsTable rows={[baseRow]} />);

    expect(screen.getByText("Market")).toBeInTheDocument();
    expect(screen.getByText("Borrow APR")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Utilization")).toBeInTheDocument();
    expect(screen.getByText("Borrowed")).toBeInTheDocument();
    expect(screen.getByText("Supplied")).toBeInTheDocument();
  });

  it("omits the utilization meter when the ratio is unavailable", () => {
    render(
      <BorrowMarketsTable
        rows={[{ ...baseRow, utilizationRatio: null, utilizationLabel: "–" }]}
      />,
    );

    expect(screen.getByText("–")).toBeInTheDocument();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  it("clamps a utilization ratio above 1 to a 100% meter width", () => {
    render(
      <BorrowMarketsTable rows={[{ ...baseRow, utilizationRatio: 1.5 }]} />,
    );

    const track = screen.getByRole("presentation");
    const fill = track.firstElementChild as HTMLElement;

    expect(fill.style.width).toBe("100%");
  });

  it("renders the empty-state copy and no rows when there are none", () => {
    render(<BorrowMarketsTable rows={[]} />);

    expect(
      screen.getByText("No borrow markets available."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId(/^borrow-market-row-/)).not.toBeInTheDocument();
  });
});
