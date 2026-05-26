/**
 * Activity page wallet-gating tests.
 *
 * The Header treats the user as connected only when BOTH the BTC and ETH
 * wallets are connected (see RootLayout.tsx). These tests lock in that the
 * Activity page uses the same canonical signal: a stale ETH address alone
 * must not trigger an indexer query or the "connected" empty state.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActivityLog } from "@/types/activityLog";

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
});

const useConnectionMock = vi.fn();
const useETHWalletMock = vi.fn();
const useActivitiesWithPendingMock = vi.fn();

vi.mock("../../../context/wallet", () => ({
  useConnection: () => useConnectionMock(),
  useETHWallet: () => useETHWalletMock(),
}));

vi.mock("../../../hooks/useActivitiesWithPending", () => ({
  useActivitiesWithPending: (arg: unknown) => useActivitiesWithPendingMock(arg),
}));

import Activity from "../Activity";

function renderActivity() {
  return render(
    <MemoryRouter initialEntries={["/activity"]}>
      <Routes>
        <Route element={<Outlet context={{ openDeposit: () => {} }} />}>
          <Route path="/activity" element={<Activity />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Activity page — wallet gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActivitiesWithPendingMock.mockReturnValue({
      data: [],
      isLoading: false,
    });
  });

  it("treats BTC-disconnected + ETH-stale-address as disconnected, skipping the indexer query", () => {
    useConnectionMock.mockReturnValue({
      isConnected: false,
      btcConnected: false,
      ethConnected: true,
    });
    useETHWalletMock.mockReturnValue({
      address: "0xabc0000000000000000000000000000000000001",
      connected: true,
    });

    renderActivity();

    expect(screen.getByTestId("activity-empty-state")).toBeInTheDocument();
    expect(
      screen.getByText("Connect your wallet to view your activity"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "No activity yet. Make your first deposit to get started.",
      ),
    ).not.toBeInTheDocument();

    expect(useActivitiesWithPendingMock).toHaveBeenCalledWith(undefined);
  });

  it("treats ETH-disconnected + BTC-connected as disconnected, skipping the indexer query", () => {
    useConnectionMock.mockReturnValue({
      isConnected: false,
      btcConnected: true,
      ethConnected: false,
    });
    useETHWalletMock.mockReturnValue({
      address: undefined,
      connected: false,
    });

    renderActivity();

    expect(screen.getByTestId("activity-empty-state")).toBeInTheDocument();
    expect(
      screen.getByText("Connect your wallet to view your activity"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "No activity yet. Make your first deposit to get started.",
      ),
    ).not.toBeInTheDocument();

    expect(useActivitiesWithPendingMock).toHaveBeenCalledWith(undefined);
  });

  it("treats both wallets connected as connected and renders the connected empty state", () => {
    useConnectionMock.mockReturnValue({
      isConnected: true,
      btcConnected: true,
      ethConnected: true,
    });
    useETHWalletMock.mockReturnValue({
      address: "0xabc0000000000000000000000000000000000001",
      connected: true,
    });

    renderActivity();

    expect(screen.getByTestId("activity-empty-state")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No activity yet. Make your first deposit to get started.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Connect your wallet to view your activity"),
    ).not.toBeInTheDocument();

    expect(useActivitiesWithPendingMock).toHaveBeenCalledWith(
      "0xabc0000000000000000000000000000000000001",
    );
  });

  it("renders a loading indicator while activities are loading", () => {
    useConnectionMock.mockReturnValue({
      isConnected: true,
      btcConnected: true,
      ethConnected: true,
    });
    useETHWalletMock.mockReturnValue({
      address: "0xabc0000000000000000000000000000000000001",
      connected: true,
    });
    useActivitiesWithPendingMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const { container } = renderActivity();

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByTestId("activity-empty-state")).not.toBeInTheDocument();
  });

  it("renders activity rows as list items when connected with activities", () => {
    useConnectionMock.mockReturnValue({
      isConnected: true,
      btcConnected: true,
      ethConnected: true,
    });
    useETHWalletMock.mockReturnValue({
      address: "0xabc0000000000000000000000000000000000001",
      connected: true,
    });

    const activities: ActivityLog[] = [
      {
        id: "row-1",
        date: new Date("2026-01-01T00:00:00Z"),
        tokenIcon: "https://example.com/btc.svg",
        type: "Deposit",
        amount: { value: "1.00", symbol: "BTC" },
        chain: "BTC",
        transactionHash: "abcd1234",
      },
      {
        id: "row-2",
        date: new Date("2026-01-02T00:00:00Z"),
        tokenIcon: "https://example.com/usdc.svg",
        type: "Borrow",
        amount: { value: "100.00", symbol: "USDC" },
        chain: "ETH",
        transactionHash: "0xdeadbeef",
      },
    ];
    useActivitiesWithPendingMock.mockReturnValue({
      data: activities,
      isLoading: false,
    });

    renderActivity();

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.queryByTestId("activity-empty-state"),
    ).not.toBeInTheDocument();
  });
});
