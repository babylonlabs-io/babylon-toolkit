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
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActivityLog } from "@/types/activityLog";

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

vi.mock("@/config", () => ({
  getNetworkConfigBTC: () => ({ coinSymbol: "sBTC" }),
  getBTCNetwork: () => "signet",
}));

// The empty state pulls in the shared EmptyState, which mounts <Connect/>
// (heavy wallet-connector graph). Stub it so the page stays a unit test.
vi.mock("@/components/Wallet", () => ({
  Connect: () => <button type="button">Connect</button>,
}));

// The expired-deposit Withdraw reuses the Vaults page's refund machinery,
// whose graph reaches the WASM package and cannot be transformed here. Stub
// the hook, its polling/params providers and the modals — the refund flow has
// its own coverage; these tests are about wallet gating.
const usePendingDepositsMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/usePendingDeposits", () => ({
  usePendingDeposits: () => {
    usePendingDepositsMock();
    return {
      expiredActivities: [],
      allActivities: [],
      ethAddress: undefined,
      broadcastModal: {},
      refundModal: { handleRefundClick: vi.fn() },
    };
  },
}));

// The USD sub-line's price source imports the built wallet-connector bundle
// (for its network enum), which vitest cannot evaluate here, and the live
// vault read goes through react-query — neither belongs to the wallet gating
// this suite checks.
vi.mock("@/hooks/usePrices", () => ({
  usePrices: () => ({ prices: {} }),
}));

vi.mock("@/hooks/useVaults", () => ({
  useVaults: () => ({ data: undefined }),
}));

vi.mock("@/context/ProtocolParamsContext", () => ({
  ProtocolParamsProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("@/context/deposit/PeginPollingContext", () => ({
  PeginPollingProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useDepositPollingResult: () => undefined,
}));

vi.mock("@/components/simple/PendingDepositModals", () => ({
  PendingDepositModals: () => null,
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
    expect(screen.queryByText("No activity yet")).not.toBeInTheDocument();

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
    expect(screen.queryByText("No activity yet")).not.toBeInTheDocument();

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
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
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
    expect(
      screen.queryByTestId("activity-empty-state"),
    ).not.toBeInTheDocument();
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
        kind: "row",
        id: "row-1",
        date: new Date("2026-01-01T00:00:00Z"),
        tokenIcon: "https://example.com/btc.svg",
        type: "Deposit",
        amount: { value: "1.00", symbol: "BTC" },
        chain: "BTC",
        transactionHash: "abcd1234",
      },
      {
        kind: "row",
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

  it("mounts the deposit lifecycle so an expired deposit can offer its refund", () => {
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

    expect(usePendingDepositsMock).toHaveBeenCalled();
  });
});
