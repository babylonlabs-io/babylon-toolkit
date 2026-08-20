/**
 * Router-level regression tests.
 *
 * 1. The /activity route renders <Activity />, which transitively calls
 *    useAaveConfig() through useActivities(). If the route element loses its
 *    AaveConfigProvider wrapper, the page throws synchronously on mount.
 * 2. The reserve detail is an overlay opened by `?reserve=<id>&tab=<tab>` over
 *    whichever page under the Aave layout the depositor is already on, so no
 *    page flashes behind the dialog. The page under the overlay stays mounted.
 * 3. /vaults renders the VaultsPage and /loans the Loans page.
 * 4. /liquidations, /explore and /markets/:reserveId each carry their own
 *    feature flag, so with that flag off both the section root and a deep link
 *    under it redirect to the dashboard.
 *
 * These tests lock in that wiring so a future router refactor can't silently
 * regress it.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  render,
  screen,
  waitFor,
  type RenderResult,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Outlet, useOutletContext } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Router } from "../router";
import { getReserveDetailRoute } from "../routes";

const featureFlagsState = vi.hoisted(() => ({
  isLiquidationAnalysisChartEnabled: true,
  isExploreEnabled: true,
  isMarketDetailPageEnabled: true,
}));

vi.mock("@/config/featureFlags", () => ({
  default: featureFlagsState,
}));

vi.mock("@/config/btc", () => ({
  getNetworkConfigBTC: () => ({ coinSymbol: "sBTC" }),
  getBTCNetwork: () => "signet",
}));

vi.mock("../components/pages/RootLayout", () => ({
  default: () => <Outlet context={{ openDeposit: () => {} }} />,
}));

vi.mock("../components/pages/not-found", () => ({
  default: () => <div data-testid="not-found" />,
}));

// The Activity page's empty state pulls in the shared EmptyState → <Connect/>
// (heavy wallet-connector graph). Stub it so the router test stays a unit test.
vi.mock("@/components/Wallet", () => ({
  Connect: () => <button type="button">Connect</button>,
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

const DASHBOARD_TESTID = "dashboard";
const RESERVE_DETAIL_TESTID = "reserve-detail";
const VAULTS_PAGE_TESTID = "vaults-page";
const LOANS_TESTID = "loans-page";
const LIQUIDATIONS_TESTID = "liquidations-page";
const EXPLORE_TESTID = "explore-page";

vi.mock("../components/pages/VaultsPage", () => ({
  default: () => <div data-testid={VAULTS_PAGE_TESTID} />,
}));

vi.mock("../components/pages/Explore", () => ({
  default: () => <div data-testid={EXPLORE_TESTID} />,
}));

vi.mock("../components/simple/DashboardPage", () => ({
  DashboardPage: () => {
    const outletContext = useOutletContext<{
      openDeposit?: () => void;
    } | null>();
    return (
      <div
        data-testid={DASHBOARD_TESTID}
        data-has-open-deposit={String(
          typeof outletContext?.openDeposit === "function",
        )}
      />
    );
  },
}));

vi.mock("../components/pages/Loans", () => ({
  default: () => <div data-testid={LOANS_TESTID} />,
}));

vi.mock("../components/pages/Liquidations", () => ({
  default: function LiquidationsPage() {
    const outletContext = useOutletContext<{
      openDeposit?: () => void;
    } | null>();
    return (
      <div
        data-testid={LIQUIDATIONS_TESTID}
        data-has-open-deposit={String(
          typeof outletContext?.openDeposit === "function",
        )}
      />
    );
  },
}));

vi.mock("../applications/aave/components/Detail", () => ({
  LoanFlowOverlay: ({
    picker,
    reserveId,
    tab,
  }: {
    picker: string | null;
    reserveId: string | null;
    tab: string;
  }) => (
    <div
      data-testid={RESERVE_DETAIL_TESTID}
      data-reserve-id={reserveId ?? ""}
      data-picker={picker ?? ""}
      data-tab={tab}
    />
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

// The Activity page reuses the deposit lifecycle to offer the expired
// deposit's refund; that graph reaches the built wallet-connector bundle,
// which vitest cannot evaluate. Routing is what this suite checks.
vi.mock("@/hooks/usePendingDeposits", () => ({
  usePendingDeposits: () => ({
    expiredActivities: [],
    allActivities: [],
    ethAddress: undefined,
    broadcastModal: {},
    refundModal: { handleRefundClick: vi.fn() },
  }),
}));

// Same reason: the Activity feed's price source imports the built
// wallet-connector bundle for its network enum, and its vault read wants a
// depositor address this suite never connects.
vi.mock("@/hooks/usePrices", () => ({
  usePrices: () => ({ prices: {} }),
}));

vi.mock("@/hooks/useVaults", () => ({
  useVaults: () => ({ data: undefined }),
}));

vi.mock("@/context/ProtocolParamsContext", () => ({
  ProtocolParamsProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/context/deposit/PeginPollingContext", () => ({
  PeginPollingProvider: ({ children }: { children: ReactNode }) => children,
  useDepositPollingResult: () => undefined,
}));

vi.mock("@/components/simple/PendingDepositModals", () => ({
  PendingDepositModals: () => null,
}));

function renderAt(path: string): RenderResult {
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

afterEach(() => {
  vi.restoreAllMocks();
  featureFlagsState.isLiquidationAnalysisChartEnabled = true;
  featureFlagsState.isExploreEnabled = true;
  featureFlagsState.isMarketDetailPageEnabled = true;
});

describe("Router — /activity regression for AaveConfigProvider wiring", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders the Activity page without throwing the provider error", async () => {
    renderAt("/activity");

    // Explicit timeout: the Activity page is lazily imported, and resolving
    // that chunk exceeds waitFor's 1s default once the full suite runs its
    // files in parallel. This assertion is about provider wiring, not speed.
    await waitFor(
      () => {
        expect(screen.getByTestId("activity-empty-state")).toBeInTheDocument();
      },
      { timeout: 10_000 },
    );

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

describe("Router — / and /activity keep their original components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dashboard at /", async () => {
    renderAt("/");

    await waitFor(() => {
      expect(screen.getByTestId(DASHBOARD_TESTID)).toBeInTheDocument();
    });
  });

  it("renders Activity at /activity, not the dashboard", async () => {
    renderAt("/activity");

    await waitFor(() => {
      expect(screen.getByTestId("activity-empty-state")).toBeInTheDocument();
    });
    expect(screen.queryByTestId(DASHBOARD_TESTID)).not.toBeInTheDocument();
  });
});

describe("Router — section routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects /liquidations to / when the liquidation-analysis flag is off", async () => {
    featureFlagsState.isLiquidationAnalysisChartEnabled = false;
    renderAt("/liquidations");

    await waitFor(() => {
      expect(screen.getByTestId(DASHBOARD_TESTID)).toBeInTheDocument();
    });
    expect(screen.queryByTestId(LIQUIDATIONS_TESTID)).not.toBeInTheDocument();
  });

  it("redirects a deep link under /liquidations when its flag is off", async () => {
    featureFlagsState.isLiquidationAnalysisChartEnabled = false;
    renderAt("/liquidations/some-deep-link");

    await waitFor(() => {
      expect(screen.getByTestId(DASHBOARD_TESTID)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
  });

  it("redirects /markets/:reserveId to / when the market detail flag is off", async () => {
    featureFlagsState.isMarketDetailPageEnabled = false;
    renderAt("/markets/1");

    await waitFor(() => {
      expect(screen.getByTestId(DASHBOARD_TESTID)).toBeInTheDocument();
    });
  });

  it("redirects /explore to / when the explore flag is off", async () => {
    featureFlagsState.isExploreEnabled = false;
    renderAt("/explore");

    await waitFor(() => {
      expect(screen.getByTestId(DASHBOARD_TESTID)).toBeInTheDocument();
    });
    expect(screen.queryByTestId(EXPLORE_TESTID)).not.toBeInTheDocument();
  });

  it("redirects a deep link under /explore when its flag is off", async () => {
    featureFlagsState.isExploreEnabled = false;
    renderAt("/explore/some-deep-link");

    await waitFor(() => {
      expect(screen.getByTestId(DASHBOARD_TESTID)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
  });

  it("renders the vaults page at /vaults, not the dashboard", async () => {
    renderAt("/vaults");

    await waitFor(() => {
      expect(screen.getByTestId(VAULTS_PAGE_TESTID)).toBeInTheDocument();
    });
    expect(screen.queryByTestId(DASHBOARD_TESTID)).not.toBeInTheDocument();
    expect(screen.queryByTestId(RESERVE_DETAIL_TESTID)).not.toBeInTheDocument();
  });

  it("renders the Loans page at /loans, not the dashboard or a placeholder", async () => {
    renderAt("/loans");

    await waitFor(() => {
      expect(screen.getByTestId(LOANS_TESTID)).toBeInTheDocument();
    });
    expect(screen.queryByTestId(DASHBOARD_TESTID)).not.toBeInTheDocument();
  });

  it("renders the Liquidation Dashboard at /liquidations", async () => {
    renderAt("/liquidations");

    await waitFor(() => {
      expect(screen.getByTestId(LIQUIDATIONS_TESTID)).toBeInTheDocument();
    });
    expect(screen.queryByTestId(DASHBOARD_TESTID)).not.toBeInTheDocument();
  });

  it("renders the Explore page at /explore, not the dashboard", async () => {
    renderAt("/explore");

    await waitFor(() => {
      expect(screen.getByTestId(EXPLORE_TESTID)).toBeInTheDocument();
    });
    expect(screen.queryByTestId(DASHBOARD_TESTID)).not.toBeInTheDocument();
  });

  it.each(["/app/aave/reserve/usdc/borrow", "/vaults/details"])(
    "rejects the nested path %s",
    async (path) => {
      renderAt(path);

      await waitFor(() => {
        expect(screen.getByTestId("not-found")).toBeInTheDocument();
      });
      expect(screen.queryByTestId(DASHBOARD_TESTID)).not.toBeInTheDocument();
    },
  );
});

describe("Router — RootLayout outlet context reaches the dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards openDeposit to the dashboard at /", async () => {
    renderAt("/");

    await waitFor(() => {
      expect(screen.getByTestId(DASHBOARD_TESTID)).toHaveAttribute(
        "data-has-open-deposit",
        "true",
      );
    });
  });

  // Regression: /liquidations moved under AaveOverlayLayout (from directly
  // under RootLayout) so it can read the Aave-scoped position hooks. That
  // move must not lose the RootLayoutContext outlet the empty states need
  // for their Deposit action.
  it("forwards openDeposit to the Liquidation Dashboard at /liquidations", async () => {
    renderAt("/liquidations");

    await waitFor(() => {
      expect(screen.getByTestId(LIQUIDATIONS_TESTID)).toHaveAttribute(
        "data-has-open-deposit",
        "true",
      );
    });
  });
});

describe("Router — reserve detail overlays over the routed page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates the reserve-detail URL (/loans base)", () => {
    expect(getReserveDetailRoute(5n, "borrow")).toBe(
      "/loans?reserve=5&tab=borrow",
    );
  });

  it("renders the reserve detail as an overlay over the dashboard", async () => {
    renderAt("/?reserve=5&tab=borrow");

    await waitFor(() => {
      expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toBeInTheDocument();
    });
    expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
      "data-reserve-id",
      "5",
    );
    expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
      "data-tab",
      "borrow",
    );
    expect(screen.getByTestId(DASHBOARD_TESTID)).toBeInTheDocument();
  });

  it("defaults to borrow when the tab is omitted", async () => {
    renderAt("/?reserve=5");

    await waitFor(() => {
      expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
        "data-tab",
        "borrow",
      );
    });
  });

  it("renders the reserve detail overlay when /loans has reserve query params", async () => {
    renderAt("/loans?reserve=5&tab=repay");

    await waitFor(() => {
      expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toBeInTheDocument();
    });
    expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
      "data-reserve-id",
      "5",
    );
    expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
      "data-tab",
      "repay",
    );
  });

  // The flow is not pinned to a base route: it opens over whichever page under
  // the Aave layout the depositor is already on, so the entry points never
  // navigate and no page flashes behind the dialog. The page under the overlay
  // must still be the one that was routed to.
  it("opens the reserve detail overlay over Overview", async () => {
    renderAt("/?reserve=5&tab=repay");

    await waitFor(() => {
      expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toBeInTheDocument();
    });
    expect(screen.getByTestId(DASHBOARD_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
      "data-tab",
      "repay",
    );
  });

  it("opens the reserve detail overlay over Vaults", async () => {
    renderAt("/vaults?reserve=5&tab=repay");

    await waitFor(() => {
      expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toBeInTheDocument();
    });
    expect(screen.getByTestId(VAULTS_PAGE_TESTID)).toBeInTheDocument();
  });

  it("rejects the old v2 reserve-detail path (/app/aave/reserve/...)", async () => {
    renderAt("/app/aave/reserve/usdc/borrow");

    await waitFor(() => {
      expect(screen.getByTestId("not-found")).toBeInTheDocument();
    });
  });
});
