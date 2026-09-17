/**
 * Activity page wallet-gating tests.
 *
 * The page reads the canonical signal, `useConnection`: confirmed Ethereum,
 * plus Bitcoin while Ethereum-only access is off (see RootLayout.tsx). These
 * tests drive the real gate, so they lock in both halves - a stale ETH address
 * alone never triggers an indexer query or the "connected" empty state, and an
 * Ethereum-only session does once the control is on.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActivityLog } from "@/types/activityLog";

const walletMock = vi.hoisted(() => ({
  btcConnected: true,
  ethConnected: true,
  confirmed: true,
  address: "0xabc0000000000000000000000000000000000001" as string | undefined,
}));
const useActivitiesWithPendingMock = vi.fn();

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useWalletConnect: () => ({ connected: walletMock.confirmed }),
  useBTCWallet: () => ({ connected: walletMock.btcConnected }),
  useETHWallet: () => ({
    connected: walletMock.ethConnected,
    address: walletMock.address,
  }),
}));

// The real gate, so the Ethereum-only control decides what this page counts as
// connected. A hand-supplied `isConnected` would pass with the control removed.
vi.mock("../../../context/wallet", async () => ({
  useConnection: (await import("@/context/wallet/useConnection")).useConnection,
  useETHWallet: (await import("@babylonlabs-io/wallet-connector")).useETHWallet,
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
  usePendingDeposits: () => usePendingDepositsMock(),
}));

// The USD sub-line's price source imports the built wallet-connector bundle
// (for its network enum), which vitest cannot evaluate here.
vi.mock("@/hooks/usePrices", () => ({
  usePrices: () => ({ prices: {} }),
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

vi.mock("@/hooks/deposit/useRefundRowAction", () => ({
  useRefundRowAction: () => ({ available: true, blockedTooltip: null }),
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
    // The real gate reads this through a live getter, so an unpinned run would
    // take whatever the developer's environment carries.
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", undefined);
    walletMock.btcConnected = true;
    walletMock.ethConnected = true;
    walletMock.confirmed = true;
    walletMock.address = "0xabc0000000000000000000000000000000000001";
    usePendingDepositsMock.mockReturnValue({
      expiredActivities: [],
      allActivities: [],
      ethAddress: undefined,
      broadcastModal: {},
      refundModal: { handleRefundClick: vi.fn() },
      emergencyWithdrawModal: {},
    });
    useActivitiesWithPendingMock.mockReturnValue({
      data: [],
      isLoading: false,
    });
  });

  // The Ethereum-only control is read from the environment by the real
  // `featureFlags` getter, so leaving it set would reach every later file.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats BTC-disconnected + ETH-stale-address as disconnected, skipping the indexer query", () => {
    walletMock.btcConnected = false;

    renderActivity();

    expect(screen.getByTestId("activity-empty-state")).toBeInTheDocument();
    expect(
      screen.getByText("Connect your wallet to view your activity"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No activity yet")).not.toBeInTheDocument();

    expect(useActivitiesWithPendingMock).toHaveBeenCalledWith(undefined);
  });

  it("treats ETH-disconnected + BTC-connected as disconnected, skipping the indexer query", () => {
    walletMock.ethConnected = false;
    walletMock.address = undefined;

    renderActivity();

    expect(screen.getByTestId("activity-empty-state")).toBeInTheDocument();
    expect(
      screen.getByText("Connect your wallet to view your activity"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No activity yet")).not.toBeInTheDocument();

    expect(useActivitiesWithPendingMock).toHaveBeenCalledWith(undefined);
  });

  it("treats both wallets connected as connected and renders the connected empty state", () => {
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

  it("queries the activity feed for Ethereum alone under Ethereum-only access", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "true");
    walletMock.btcConnected = false;

    renderActivity();

    expect(useActivitiesWithPendingMock).toHaveBeenCalledWith(
      "0xabc0000000000000000000000000000000000001",
    );
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(
      screen.queryByText("Connect your wallet to view your activity"),
    ).not.toBeInTheDocument();
  });

  it("renders a loading indicator while activities are loading", () => {
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
    renderActivity();

    expect(usePendingDepositsMock).toHaveBeenCalled();
  });

  it("keeps a refundable expired deposit distinct from a completed refund", () => {
    usePendingDepositsMock.mockReturnValue({
      expiredActivities: [{ id: "vault-1" }],
      allActivities: [],
      ethAddress: "0xabc0000000000000000000000000000000000001",
      broadcastModal: {},
      refundModal: { handleRefundClick: vi.fn() },
      emergencyWithdrawModal: {},
    });
    useActivitiesWithPendingMock.mockReturnValue({
      data: [
        {
          kind: "row",
          id: "pending-deposit",
          vaultId: "vault-1",
          date: new Date("2026-01-01T00:00:00Z"),
          tokenIcon: "https://example.com/btc.svg",
          type: "Pending Deposit",
          amount: { value: "1.00", symbol: "BTC" },
          chain: "BTC",
          transactionHash: "abcd1234",
          isPending: true,
        } satisfies ActivityLog,
      ],
      isLoading: false,
    });

    const { container } = renderActivity();

    expect(screen.getByRole("button", { name: "Withdraw" })).toBeEnabled();
    expect(screen.queryByText("Refund")).not.toBeInTheDocument();
    expect(container.querySelector(".opacity-60")).not.toBeInTheDocument();
    expect(container.querySelector("li > div")).not.toHaveClass(
      "bg-transparent",
    );
  });
});
