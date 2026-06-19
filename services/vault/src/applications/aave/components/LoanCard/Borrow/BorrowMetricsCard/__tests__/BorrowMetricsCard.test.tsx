/**
 * BorrowMetricsCard — Available liquidity before → after projection.
 *
 * Locks in that the row shows the post-borrow figure as `current → projected`
 * when a projection is supplied (mirroring the health-factor row), and the
 * current value alone otherwise.
 */

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { BorrowMetricsCard } from "../BorrowMetricsCard";

vi.mock("@babylonlabs-io/core-ui", () => ({
  SubSection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Hint: () => null,
}));

vi.mock("@/components/shared", () => ({
  HeartIcon: () => null,
}));

const baseProps = {
  availableLiquidity: "45.2K",
  borrowApr: "3.7%",
  utilization: "25%",
  healthFactor: "2.10",
  healthFactorValue: 2.1,
};

describe("BorrowMetricsCard", () => {
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
