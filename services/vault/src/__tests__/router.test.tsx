/**
 * Router-level regression tests.
 *
 * 1. The /activity route renders <Activity />, which transitively calls
 *    useAaveConfig() through useActivities(). If the route element loses its
 *    AaveConfigProvider wrapper, the page throws synchronously on mount.
 * 2. The reserve detail (/app/aave/reserve/:reserveId) is an overlay on top of
 *    the dashboard, not a sibling route that replaces it. The dashboard must
 *    stay mounted underneath so opening the overlay never blanks the page.
 * 3. The v3-only sections are reachable only when ENABLE_V3_UI is on. With the
 *    flag off a direct load of one of them redirects to the v2 dashboard.
 *
 * These tests lock in that wiring so a future router refactor can't silently
 * regress it.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Outlet } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const featureFlagsState = vi.hoisted(() => ({ isV3UiEnabled: false }));

vi.mock("@/config/featureFlags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/featureFlags")>();
  return {
    default: Object.create(actual.default, {
      isV3UiEnabled: {
        get: () => featureFlagsState.isV3UiEnabled,
        enumerable: true,
      },
    }),
  };
});

vi.mock("../components/pages/RootLayout", () => ({
  default: () => <Outlet context={{ openDeposit: () => {} }} />,
}));

vi.mock("../applications", () => ({
  getAllApplications: () => [],
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

// Echo the `tab` prop the router resolved from the path so the tests can assert
// that /borrow, /repay and the bare-path redirect each route to the right mode —
// the core behavior of this PR. A prop-ignoring mock would render the same
// marker for every route and verify nothing about borrow-vs-repay routing.
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

describe("Router — reserve detail is an overlay over the persistent dashboard", () => {
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

  it("routes the /borrow sub-path to the detail in borrow mode, dashboard still mounted", async () => {
    await renderAt("/app/aave/reserve/usdc/borrow");

    // Both present: the dashboard stays mounted and the reserve detail renders
    // on top of it, rather than replacing it (which is what caused the blank
    // flash when the two were sibling routes).
    await waitFor(() => {
      expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toBeInTheDocument();
    });
    expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
      "data-tab",
      "borrow",
    );
    expect(screen.getByText(DASHBOARD_MARKER)).toBeInTheDocument();
  });

  it("routes the /repay sub-path to the detail in repay mode", async () => {
    await renderAt("/app/aave/reserve/usdc/repay");

    await waitFor(() => {
      expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toBeInTheDocument();
    });
    expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
      "data-tab",
      "repay",
    );
  });

  it("redirects the bare reserve path to its borrow sub-route", async () => {
    await renderAt("/app/aave/reserve/usdc");

    // The index route redirects to /borrow, so the detail renders in borrow mode.
    await waitFor(() => {
      expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toBeInTheDocument();
    });
    expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
      "data-tab",
      "borrow",
    );
  });
});

describe("Router — v3-only routes are gated on the ENABLE_V3_UI flag", () => {
  const V3_ROUTE_PATHS = ["vaults", "loans", "liquidations"];

  beforeEach(() => {
    vi.clearAllMocks();
    featureFlagsState.isV3UiEnabled = false;
  });

  afterEach(() => {
    featureFlagsState.isV3UiEnabled = false;
  });

  it.each(V3_ROUTE_PATHS)(
    "redirects a direct load of /%s to the v2 dashboard while the flag is off",
    async (path) => {
      await renderAt(`/${path}`);

      await waitFor(() => {
        expect(screen.getByText(DASHBOARD_MARKER)).toBeInTheDocument();
      });
      expect(screen.queryByText("Page not found")).not.toBeInTheDocument();
    },
  );

  it.each(V3_ROUTE_PATHS)(
    "redirects a deep link under /%s, not just the section root",
    async (path) => {
      await renderAt(`/${path}/some-deep-link`);

      await waitFor(() => {
        expect(screen.getByText(DASHBOARD_MARKER)).toBeInTheDocument();
      });
      expect(screen.queryByText("Page not found")).not.toBeInTheDocument();
    },
  );

  it.each(V3_ROUTE_PATHS)(
    "stops redirecting /%s to the dashboard once the flag is on",
    async (path) => {
      featureFlagsState.isV3UiEnabled = true;

      await renderAt(`/${path}`);

      await waitFor(() => {
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });
      expect(screen.queryByText(DASHBOARD_MARKER)).not.toBeInTheDocument();
    },
  );
});
