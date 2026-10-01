import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { publishPendingDepositSummary } from "@/context/deposit/pendingDepositCount";

import { AppSidebar } from "../AppSidebar";

const featureFlagsMock = vi.hoisted(() => ({
  isExploreEnabled: true,
}));

vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

describe("AppSidebar", () => {
  beforeEach(() => {
    featureFlagsMock.isExploreEnabled = true;
    publishPendingDepositSummary(0, null);
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

  it("updates the progress arc without a count change", () => {
    publishPendingDepositSummary(3, 5 / 6);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppSidebar />
      </MemoryRouter>,
    );

    const badge = screen.getByRole("img", { name: "3 pending deposits" });
    expect(badge).toHaveTextContent("3");
    expect(screen.getByTestId("nav-vaults")).toContainElement(badge);
    expect(badge).toHaveAttribute("title", "83% average deposit progress");
    expect(badge.querySelector("circle[stroke-dasharray]")).toHaveAttribute(
      "stroke-dashoffset",
      String(1 - 5 / 6),
    );

    act(() => publishPendingDepositSummary(3, 13 / 15));

    expect(badge).toHaveTextContent("3");
    expect(badge).toHaveAttribute("title", "87% average deposit progress");
    expect(badge.querySelector("circle[stroke-dasharray]")).toHaveAttribute(
      "stroke-dashoffset",
      String(1 - 13 / 15),
    );
  });

  it.each([null, 0])("shows no progress arc for %s progress", (progress) => {
    publishPendingDepositSummary(1, progress);
    render(
      <MemoryRouter>
        <AppSidebar />
      </MemoryRouter>,
    );

    const badge = screen.getByRole("img", { name: "1 pending deposit" });
    expect(badge.querySelector("circle[stroke-dasharray]")).toBeNull();
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
    publishPendingDepositSummary(10, null);

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
