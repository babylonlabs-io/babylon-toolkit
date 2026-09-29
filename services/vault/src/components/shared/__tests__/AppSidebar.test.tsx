import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "../AppSidebar";

const featureFlagsMock = vi.hoisted(() => ({
  isExploreEnabled: true,
}));

vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));
const pendingCountMock = vi.hoisted(() => ({ value: 0 }));

vi.mock("@/context/deposit/pendingDepositCount", () => ({
  usePendingDepositCount: () => pendingCountMock.value,
}));

describe("AppSidebar", () => {
  beforeEach(() => {
    featureFlagsMock.isExploreEnabled = true;
    pendingCountMock.value = 0;
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

  it("hides only Explore when the explore flag is off, keeping Liquidations", () => {
    featureFlagsMock.isExploreEnabled = false;

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppSidebar />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Explore")).not.toBeInTheDocument();
    for (const label of [
      "Overview",
      "Vaults",
      "Loans",
      "Activity",
      "Liquidations",
    ]) {
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

  it("gives each nav link a nav-<id> testid pointing at its route", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppSidebar />
      </MemoryRouter>,
    );

    // The real-wallet E2E CLI changes section through these testids
    // (e2e/real/actions/navigation.ts), so they are load-bearing.
    for (const [id, path] of [
      ["overview", "/"],
      ["vaults", "/vaults"],
      ["loans", "/loans"],
      ["activity", "/activity"],
      ["liquidations", "/liquidations"],
      ["explore", "/explore"],
    ]) {
      expect(screen.getByTestId(`nav-${id}`)).toHaveAttribute("href", path);
    }
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

  it("shows the pending deposit count on the Vaults row", () => {
    pendingCountMock.value = 3;

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppSidebar />
      </MemoryRouter>,
    );

    const badge = screen.getByRole("img", { name: "3 pending deposits" });
    expect(badge).toHaveTextContent("3");
    expect(screen.getByTestId("nav-vaults")).toContainElement(badge);
  });

  it("shows no badge when there are no pending deposits", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppSidebar />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("img", { name: /pending deposit/ }),
    ).not.toBeInTheDocument();
  });

  it("caps the visible count at 9+ but keeps the full count in the accessible name", () => {
    pendingCountMock.value = 10;

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppSidebar />
      </MemoryRouter>,
    );

    const badge = screen.getByRole("img", { name: "10 pending deposits" });
    expect(badge).toHaveTextContent("9+");
    expect(badge).not.toHaveTextContent("10");
  });
});
