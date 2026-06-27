/**
 * Router-level regression tests.
 *
 * 1. The /activity route renders <Activity />, which transitively calls
 *    useAaveConfig() through useActivities(). If the route element loses its
 *    AaveConfigProvider wrapper, the page throws synchronously on mount.
 * 2. The borrow/repay flow is now a modal (ReserveDetailModalSlot) rather than
 *    a deep-linkable route. The reserve-detail routes were removed; hitting them
 *    renders a 404.
 *
 * These tests lock in that wiring so a future router refactor can't silently
 * regress it.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Outlet } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/pages/RootLayout", () => ({
  default: () => <Outlet context={{ openDeposit: () => {} }} />,
}));

vi.mock("../applications", () => ({
  getApplication: () => undefined,
  getApplicationMetadataByController: () => undefined,
}));

vi.mock("../applications/aave/services", () => ({
  fetchAaveAppConfig: vi.fn().mockResolvedValue({
    config: {
      adapterAddress: "0x1",
      vaultBtcAddress: "0x2",
      btcVaultRegistryAddress: "0x3",
      coreSpokeAddress: "0x4" as `0x${string}`,
      vaultBtcReserveId: 1n,
    },
    vbtcReserve: null,
    borrowableReserves: [],
    allBorrowReserves: [],
  }),
}));

vi.mock("@/context/wallet", () => ({
  useETHWallet: () => ({ address: "0xethtest", connected: true }),
  useBTCWallet: () => ({ connected: true }),
  useConnection: () => ({
    isConnected: true,
    btcConnected: true,
    ethConnected: true,
  }),
}));

const DASHBOARD_MARKER = "dashboard-marker";
const RESERVE_DETAIL_TESTID = "reserve-detail-marker";

vi.mock("../components/simple/DashboardPage", () => ({
  DashboardPage: () => <div>{DASHBOARD_MARKER}</div>,
}));

vi.mock("../applications/aave/components/Detail", () => ({
  AaveReserveDetail: ({ tab }: { tab: string }) => (
    <div data-testid={RESERVE_DETAIL_TESTID} data-tab={tab} />
  ),
}));

vi.mock("../services/activity", async () => {
  const actual = await vi.importActual<typeof import("../services/activity")>(
    "../services/activity",
  );
  return {
    ...actual,
    fetchUserActivities: vi.fn().mockResolvedValue([]),
    getPendingActivities: vi.fn().mockReturnValue([]),
  };
});

vi.mock("../services/activity/claimTxResolver", () => ({
  resolveRedeemClaimTxids: vi.fn(async () => new Map()),
}));

async function renderAt(path: string): Promise<ReturnType<typeof render>> {
  const { Router } = await import("../router");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ui: ReactNode = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Router />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(ui);
}

describe("Router — /activity regression for AaveConfigProvider wiring", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders the Activity page heading without throwing the provider error", async () => {
    await renderAt("/activity");

    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeInTheDocument();
    });

    const PROVIDER_ERROR =
      "useAaveConfig must be used within an AaveConfigProvider";
    const sawProviderError = consoleErrorSpy.mock.calls
      .flat()
      .some((arg: unknown) => {
        if (typeof arg === "string") return arg.includes(PROVIDER_ERROR);
        if (arg instanceof Error) return arg.message.includes(PROVIDER_ERROR);
        return false;
      });
    expect(sawProviderError).toBe(false);
  });
});

describe("Router — borrow/repay is a modal, the reserve routes are gone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders only the dashboard at the index route", async () => {
    await renderAt("/");

    await waitFor(() => {
      expect(screen.getByText(DASHBOARD_MARKER)).toBeInTheDocument();
    });
    expect(screen.queryByTestId(RESERVE_DETAIL_TESTID)).not.toBeInTheDocument();
  });

  it.each([
    "/app/aave/reserve/usdc/borrow",
    "/app/aave/reserve/usdc/repay",
    "/app/aave/reserve/usdc",
  ])("404s the removed reserve route %s", async (path) => {
    await renderAt(path);

    await waitFor(() => {
      expect(screen.getByText("404")).toBeInTheDocument();
    });
    expect(screen.queryByText(DASHBOARD_MARKER)).not.toBeInTheDocument();
    expect(screen.queryByTestId(RESERVE_DETAIL_TESTID)).not.toBeInTheDocument();
  });
});
