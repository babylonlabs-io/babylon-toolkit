import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import type { ActivityLog } from "../../../types/activityLog";
import { ActivityList } from "../ActivityList";

const makeRow = (overrides: Partial<ActivityLog>): ActivityLog => ({
  kind: "row",
  id: overrides.id ?? "x",
  date: overrides.date ?? new Date("2025-10-16T11:48:47Z"),
  type: overrides.type ?? "Deposit",
  amount: overrides.amount ?? { value: "1", symbol: "BTC" },
  chain: overrides.chain ?? "BTC",
  transactionHash: overrides.transactionHash ?? "abc",
  tokenIcon: overrides.tokenIcon ?? "test://btc.svg",
  isPending: overrides.isPending,
  isExpired: overrides.isExpired,
});

function renderList(props: {
  activities: ActivityLog[];
  isConnected: boolean;
}) {
  return render(
    <MemoryRouter initialEntries={["/activity"]}>
      <Routes>
        <Route element={<Outlet context={{ openDeposit: () => {} }} />}>
          <Route path="/activity" element={<ActivityList {...props} />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("ActivityList", () => {
  it("renders one listitem per row in source order", () => {
    const rows = [
      makeRow({ id: "a", type: "Deposit" }),
      makeRow({
        id: "b",
        type: "Borrow",
        amount: { value: "100", symbol: "USDC" },
      }),
    ];
    renderList({ activities: rows, isConnected: true });

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Deposit")).toBeInTheDocument();
    expect(within(items[1]).getByText("Borrow")).toBeInTheDocument();
  });

  it("renders the page title from copy", () => {
    renderList({ activities: [], isConnected: true });
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });

  it("filters rows by selected type", () => {
    const rows = [
      makeRow({ id: "a", type: "Deposit" }),
      makeRow({
        id: "b",
        type: "Borrow",
        amount: { value: "100", symbol: "USDC" },
      }),
    ];
    renderList({ activities: rows, isConnected: true });

    fireEvent.click(screen.getByRole("button", { name: /show all/i }));
    fireEvent.click(screen.getByRole("option", { name: "Borrowed" }));

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(within(items[0]).getByText("Borrow")).toBeInTheDocument();
  });

  it("shows a minimal empty state without the deposit CTA when a filter hides all rows", () => {
    const rows = [makeRow({ id: "a", type: "Deposit" })];
    renderList({ activities: rows, isConnected: true });

    fireEvent.click(screen.getByRole("button", { name: /show all/i }));
    fireEvent.click(screen.getByRole("option", { name: "Borrowed" }));

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("No activity")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deposit/i })).toBeNull();
  });

  it("shows the empty state when source is empty", () => {
    renderList({ activities: [], isConnected: true });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });

  it("renders the disconnected empty state when isConnected is false", () => {
    renderList({ activities: [], isConnected: false });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(
      screen.getByText(/connect your wallet to view your activity/i),
    ).toBeInTheDocument();
  });

  it("hides the filter dropdown when disconnected", () => {
    renderList({ activities: [], isConnected: false });
    expect(
      screen.queryByRole("button", { name: /show all/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the filter dropdown when connected", () => {
    renderList({ activities: [], isConnected: true });
    expect(
      screen.getByRole("button", { name: /show all/i }),
    ).toBeInTheDocument();
  });

  it("renders the Aave logo next to the dropdown when connected", () => {
    renderList({ activities: [], isConnected: true });
    expect(screen.getByAltText("Aave")).toBeInTheDocument();
  });

  it("hides the Aave logo when disconnected", () => {
    renderList({ activities: [], isConnected: false });
    expect(screen.queryByAltText("Aave")).not.toBeInTheDocument();
  });

  it("resets an active filter on disconnect so the disconnected empty state shows", () => {
    const rows = [
      makeRow({ id: "a", type: "Deposit" }),
      makeRow({
        id: "b",
        type: "Borrow",
        amount: { value: "100", symbol: "USDC" },
      }),
    ];
    const { rerender } = renderList({
      activities: rows,
      isConnected: true,
    });

    // User picks a filter while connected.
    fireEvent.click(screen.getByRole("button", { name: /show all/i }));
    fireEvent.click(screen.getByRole("option", { name: "Borrowed" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);

    // Wallet disconnects. Filter must be cleared, not preserved.
    rerender(
      <MemoryRouter initialEntries={["/activity"]}>
        <Routes>
          <Route element={<Outlet context={{ openDeposit: () => {} }} />}>
            <Route
              path="/activity"
              element={<ActivityList activities={[]} isConnected={false} />}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/connect your wallet to view your activity/i),
    ).toBeInTheDocument();
  });
});
