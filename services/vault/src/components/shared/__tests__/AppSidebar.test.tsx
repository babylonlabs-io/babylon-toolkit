import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "../AppSidebar";

const featureFlagsMock = vi.hoisted(() => ({
  isLiquidationAnalysisChartEnabled: true,
}));

vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

describe("AppSidebar", () => {
  beforeEach(() => {
    featureFlagsMock.isLiquidationAnalysisChartEnabled = true;
  });

  it("renders all 6 nav items", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppSidebar />
      </MemoryRouter>,
    );

    for (const label of [
      "Overview",
      "Vaults",
      "Loans",
      "Activity",
      "Liquidations",
      "Explore",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("hides Liquidations and Explore when the liquidation-analysis flag is off", () => {
    featureFlagsMock.isLiquidationAnalysisChartEnabled = false;

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppSidebar />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Liquidations")).not.toBeInTheDocument();
    expect(screen.queryByText("Explore")).not.toBeInTheDocument();
    for (const label of ["Overview", "Vaults", "Loans", "Activity"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks the item matching the current route active", () => {
    render(
      <MemoryRouter initialEntries={["/activity"]}>
        <AppSidebar />
      </MemoryRouter>,
    );

    expect(screen.getByText("Activity").closest("div")).toHaveClass(
      "text-accent-primary",
    );
    expect(screen.getByText("Overview").closest("div")).not.toHaveClass(
      "text-accent-primary",
    );
  });

  it("marks Overview active at the exact root path", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppSidebar />
      </MemoryRouter>,
    );

    expect(screen.getByText("Overview").closest("div")).toHaveClass(
      "text-accent-primary",
    );
  });
});
