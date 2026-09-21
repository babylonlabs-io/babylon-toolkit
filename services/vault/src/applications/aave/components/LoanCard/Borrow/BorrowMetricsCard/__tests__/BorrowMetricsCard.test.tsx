/**
 * BorrowMetricsCard — the Available liquidity and Borrow APR rows each render
 * `current → projected` when a projection is supplied (mirroring the
 * health-factor row), and the current value alone otherwise. The Hub row names
 * which hub's market the figures describe.
 */

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { HEALTH_FACTOR_COLORS } from "@/applications/aave/utils";
import { COPY } from "@/copy";

// Component tests mock core-ui (its dist isn't built in the test run).
vi.mock("@babylonlabs-io/core-ui", () => ({
  Hint: ({ tooltip }: { tooltip?: ReactNode }) => <span>{tooltip}</span>,
  SubSection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/shared", () => ({
  HeartIcon: ({ color }: { color: string }) => (
    <span data-testid="heart-icon" data-color={color} />
  ),
}));

import { BorrowMetricsCard } from "../BorrowMetricsCard";

const baseProps = {
  hub: {
    source: "registry" as const,
    address: "0xF5E52D571Ed9b4779399A815815ABeFF7D7ec4ca" as const,
    label: "Core Hub",
  },
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

describe("BorrowMetricsCard hub row", () => {
  it("names the reserve's hub between available liquidity and borrow APR", () => {
    const { container } = render(<BorrowMetricsCard {...baseProps} />);

    const text = container.textContent ?? "";
    const liquidityAt = text.indexOf(COPY.loans.availableLiquidityLabel);
    const hubAt = text.indexOf(`${COPY.loans.hub.label}Core Hub`);
    const aprAt = text.indexOf(COPY.loans.borrowRateLabel);

    expect(hubAt).toBeGreaterThan(liquidityAt);
    expect(aprAt).toBeGreaterThan(hubAt);
  });

  it("flags an unregistered hub with the unknown-hub warning", () => {
    render(
      <BorrowMetricsCard
        {...baseProps}
        hub={{
          source: "address",
          address: "0x1111111111111111111111111111111111111111",
          label: "0x1111...1111",
        }}
      />,
    );

    expect(screen.getByText("0x1111...1111")).toBeInTheDocument();
    expect(
      screen.getByText(COPY.loans.hub.unknownHubWarning),
    ).toBeInTheDocument();
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

describe("BorrowMetricsCard health factor row", () => {
  it("renders each value before its heart, greying the previous heart and colouring the current one by status", () => {
    render(<BorrowMetricsCard {...baseProps} healthFactorOriginal="1.10" />);

    const previous = screen.getByText("1.10");
    expect(previous.firstChild?.textContent).toBe("1.10");
    expect(previous.lastElementChild).toHaveAttribute(
      "data-color",
      HEALTH_FACTOR_COLORS.GRAY,
    );
    expect(previous).toHaveClass("text-accent-secondary");

    const current = screen.getByText("2.10");
    expect(current.firstChild?.textContent).toBe("2.10");
    expect(current.lastElementChild).toHaveAttribute(
      "data-color",
      HEALTH_FACTOR_COLORS.GREEN,
    );
  });

  it("renders the value before its heart when there is no previous health factor", () => {
    render(<BorrowMetricsCard {...baseProps} />);

    const current = screen.getByText("2.10");
    expect(current.firstChild?.textContent).toBe("2.10");
    expect(current.lastElementChild).toHaveAttribute(
      "data-color",
      HEALTH_FACTOR_COLORS.GREEN,
    );
  });
});
