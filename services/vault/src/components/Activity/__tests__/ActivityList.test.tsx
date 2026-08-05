import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import type { ActivityLog } from "@/types/activityLog";

const DESKTOP_WIDTH = 1024;

vi.mock("@/config", () => ({
  getNetworkConfigBTC: () => ({ coinSymbol: "sBTC" }),
  getBTCNetwork: () => "signet",
}));

// The v3 disconnected empty state renders the shared EmptyState, which mounts
// <Connect/> (many wallet providers). Stub it so the list stays a unit test.
vi.mock("@/components/Wallet", () => ({
  Connect: () => <button type="button">Connect</button>,
}));

// The real button reads the deposit-polling context to decide whether the
// refund is available — that gating is the Vaults page's, covered there. These
// tests are about which row the list hands the action to, and with which id.
vi.mock("../ExpiredWithdrawButton", () => ({
  ExpiredWithdrawButton: ({
    vaultId,
    onWithdraw,
  }: {
    vaultId: string;
    onWithdraw: (vaultId: string) => void;
  }) => (
    <button type="button" onClick={() => onWithdraw(vaultId)}>
      Withdraw
    </button>
  ),
}));

import { ActivityList } from "../ActivityList";

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: DESKTOP_WIDTH,
  });
});

const makeRow = (overrides: Partial<ActivityLog>): ActivityLog => ({
  kind: "row",
  id: overrides.id ?? "x",
  date: overrides.date ?? new Date("2025-10-16T11:48:47Z"),
  type: overrides.type ?? "Deposit",
  amount: overrides.amount ?? { value: "1", symbol: "BTC" },
  chain: overrides.chain ?? "BTC",
  transactionHash: overrides.transactionHash ?? "abc",
  tokenIcon: overrides.tokenIcon ?? "test://btc.svg",
  vaultId: overrides.vaultId,
  isPending: overrides.isPending,
  isExpired: overrides.isExpired,
});

function renderList(props: {
  activities: ActivityLog[];
  isConnected: boolean;
  refundableVaultIds?: ReadonlySet<string>;
  onWithdraw?: (vaultId: string) => void;
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

  it("v3 UI + disconnected: renders no in-page heading and no filter row", () => {
    renderList({ activities: [], isConnected: false });

    expect(
      screen.queryByRole("heading", { name: COPY.activity.pageTitle }),
    ).not.toBeInTheDocument();
    expect(screen.queryByAltText("Aave")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /show all/i }),
    ).not.toBeInTheDocument();
    // The persistent app header owns the title in v3; the disconnected
    // empty state below must still render on its own.
    expect(
      screen.getByText(/connect your wallet to view your activity/i),
    ).toBeInTheDocument();
  });

  it("v3 UI + mobile: keeps the in-page heading visible", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
    });

    renderList({ activities: [], isConnected: false });

    expect(
      screen.getByRole("heading", { name: COPY.activity.pageTitle }),
    ).toBeInTheDocument();
  });

  it("v3 UI + connected: keeps the filter dropdown but drops the Aave logo the v2 header shows", () => {
    const rows = [makeRow({ id: "a", type: "Deposit" })];
    renderList({ activities: rows, isConnected: true });

    expect(
      screen.queryByRole("heading", { name: COPY.activity.pageTitle }),
    ).not.toBeInTheDocument();
    expect(screen.queryByAltText("Aave")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /show all/i }),
    ).toBeInTheDocument();
  });

  it("v3 UI: groups rows under date-group headers (Today vs an explicit date)", () => {
    const rows = [
      makeRow({ id: "today", type: "Deposit", date: new Date() }),
      makeRow({
        id: "old",
        type: "Borrow",
        amount: { value: "100", symbol: "USDC" },
        date: new Date(2025, 0, 2, 12, 0, 0),
      }),
    ];
    renderList({ activities: rows, isConnected: true });

    expect(screen.getByText(COPY.activity.dateToday)).toBeInTheDocument();
    expect(screen.getByText("2025-01-02")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("v3 UI + connected + no activity: shows the shared empty state with a Deposit CTA", () => {
    renderList({ activities: [], isConnected: true });

    expect(screen.getByText(COPY.activity.emptyV3Title)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.overview.depositAction }),
    ).toBeInTheDocument();
  });

  it("v3 UI + filtered to empty: distinct filtered-empty state with no CTA", () => {
    const rows = [makeRow({ id: "a", type: "Deposit" })];
    renderList({ activities: rows, isConnected: true });

    fireEvent.click(screen.getByRole("button", { name: /show all/i }));
    fireEvent.click(screen.getByRole("option", { name: "Borrowed" }));

    expect(screen.getByText(COPY.activity.emptyFiltered)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deposit/i })).toBeNull();
  });
  it("v3 UI: offers Withdraw on the row whose vaultId is refundable, matching on vaultId not the row id", () => {
    const onWithdraw = vi.fn();
    // An indexed row: its id is the event (txHash-logIndex-type), NOT the
    // vault. Matching on `id` would never fire here.
    const rows = [
      makeRow({
        id: "0xabc-3-deposit",
        vaultId: "0xvault1",
        isPending: true,
      }),
    ];

    renderList({
      activities: rows,
      isConnected: true,
      refundableVaultIds: new Set(["0xvault1"]),
      onWithdraw,
    });

    fireEvent.click(screen.getByRole("button", { name: /withdraw/i }));
    expect(onWithdraw).toHaveBeenCalledWith("0xvault1");
  });

  it("v3 UI: leaves a row alone when its vaultId is not refundable", () => {
    const rows = [makeRow({ id: "0xabc-3-deposit", vaultId: "0xvault2" })];

    renderList({
      activities: rows,
      isConnected: true,
      refundableVaultIds: new Set(["0xvault1"]),
      onWithdraw: vi.fn(),
    });

    expect(screen.queryByRole("button", { name: /withdraw/i })).toBeNull();
  });

  it("v3 UI: never matches a refundable vault id against a row id that happens to equal it", () => {
    // Row carries no vaultId (the indexer does not scope borrows to a vault),
    // but its event id collides with a refundable vault id.
    const rows = [makeRow({ id: "0xvault1", type: "Borrow" })];

    renderList({
      activities: rows,
      isConnected: true,
      refundableVaultIds: new Set(["0xvault1"]),
      onWithdraw: vi.fn(),
    });

    expect(screen.queryByRole("button", { name: /withdraw/i })).toBeNull();
  });
});
