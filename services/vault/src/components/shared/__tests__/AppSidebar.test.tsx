import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { AppSidebar } from "../AppSidebar";

describe("AppSidebar", () => {
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
