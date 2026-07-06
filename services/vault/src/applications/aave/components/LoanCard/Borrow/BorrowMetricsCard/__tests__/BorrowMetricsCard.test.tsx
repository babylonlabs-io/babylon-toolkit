/**
 * BorrowMetricsCard — the Available liquidity and Borrow APR rows each render
 * `current → projected` when a projection is supplied (mirroring the
 * health-factor row), and the current value alone otherwise.
 */

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// Component tests mock core-ui (its dist isn't built in the test run).
vi.mock("@babylonlabs-io/core-ui", () => ({
  Hint: () => null,
  SubSection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/shared", () => ({
  HeartIcon: () => <span data-testid="heart-icon" />,
}));

import { BorrowMetricsCard } from "../BorrowMetricsCard";

const baseProps = {
  availableLiquidity: "45.2K",
  borrowApr: "3.70%",
  utilization: "25%",
  healthFactor: "2.10",
  healthFactorValue: 2.1,
};

describe("BorrowMetricsCard available liquidity row", () => {
  it("shows available liquidity as current → projected when a projection is given", () => {
    render(
      <BorrowMetricsCard {...baseProps} availableLiquidityProjected="0 USDT" />,
    );

    expect(screen.getByText("45.2K")).toBeInTheDocument();
    expect(screen.getByText("→")).toBeInTheDocument();
    expect(screen.getByText("0 USDT")).toBeInTheDocument();
  });

  it("shows only the current available liquidity when no projection is given", () => {
    render(
      <BorrowMetricsCard {...baseProps} availableLiquidity="45.2K USDT" />,
    );

    expect(screen.getByText("45.2K USDT")).toBeInTheDocument();
    expect(screen.queryByText("→")).not.toBeInTheDocument();
  });
});

describe("BorrowMetricsCard borrow APR row", () => {
  it("shows the current APR alone when no projection is provided", () => {
    render(<BorrowMetricsCard {...baseProps} />);

    expect(screen.getByText("3.70%")).toBeInTheDocument();
    // No transition arrow without a projected value (health factor row also
    // has none here since healthFactorOriginal is unset).
    expect(screen.queryByText("→")).not.toBeInTheDocument();
  });

  it("shows current → projected when a projected APR is provided", () => {
    render(<BorrowMetricsCard {...baseProps} borrowAprProjected="4.20%" />);

    expect(screen.getByText("3.70%")).toBeInTheDocument();
    expect(screen.getByText("4.20%")).toBeInTheDocument();
    expect(screen.getByText("→")).toBeInTheDocument();
  });
});
