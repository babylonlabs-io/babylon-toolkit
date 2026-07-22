/**
 * Router-level regression tests.
 *
 * 1. The /activity route renders <Activity />, which transitively calls
 *    useAaveConfig() through useActivities(). If the route element loses its
 *    AaveConfigProvider wrapper, the page throws synchronously on mount.
 * 2. The reserve detail is an overlay: v2 uses `/?reserve=<id>&tab=<tab>` over the
 *    dashboard, v3 uses `/loans?reserve=<id>&tab=<tab>` over the loans page.
 *    Both are gated by pathname to prevent wrong-base rendering. The dashboard
 *    stays mounted in v2 so opening the overlay never blanks the page.
 * 3. /vaults, /loans, and /liquidations are reachable only when ENABLE_V3_UI
 *    is on. With the flag off a direct load of one of them redirects to the
 *    v2 dashboard. /vaults renders the VaultsPage and /loans the Loans page;
 *    /liquidations is still a placeholder.
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

import { V3_GUARDED_ROUTE_PATHS } from "@/config/v3Navigation";

import { Router } from "../router";
import { getReserveDetailRoute } from "../routes";

const featureFlagsState = vi.hoisted(() => ({ isV3UiEnabled: false }));

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

vi.mock("../components/pages/VaultsPage", () => ({
  default: () => <div data-testid={VAULTS_PAGE_TESTID} />,
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

vi.mock("../applications/aave/components/Detail", () => ({
  AaveReserveDetail: ({
    reserveId,
    tab,
  }: {
    reserveId: string;
    tab: string;
  }) => (
    <div
      data-testid={RESERVE_DETAIL_TESTID}
      data-reserve-id={reserveId}
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

function setV3Flag(value?: string) {
  featureFlagsState.isV3UiEnabled = value === "true";
}

afterEach(() => {
  vi.restoreAllMocks();
  featureFlagsState.isV3UiEnabled = false;
});

describe("Router — /activity regression for AaveConfigProvider wiring", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders the Activity page heading without throwing the provider error", async () => {
    renderAt("/activity");

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

describe("Router — / and /activity keep their original components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["true", "false", undefined])(
    "renders the dashboard at / regardless of the v3 flag (%s)",
    async (flag) => {
      setV3Flag(flag);
      renderAt("/");

      await waitFor(() => {
        expect(screen.getByTestId(DASHBOARD_TESTID)).toBeInTheDocument();
      });
      expect(screen.queryByTestId("v3-placeholder")).not.toBeInTheDocument();
    },
  );

  it("renders Activity at /activity, not the dashboard", async () => {
    renderAt("/activity");

    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeInTheDocument();
    });
    expect(screen.queryByTestId(DASHBOARD_TESTID)).not.toBeInTheDocument();
  });
});

describe("Router — new v3 placeholder routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(V3_GUARDED_ROUTE_PATHS.map((path) => `/${path}`))(
    "redirects %s to / when the flag is off",
    async (path) => {
      setV3Flag("false");
      renderAt(path);

      await waitFor(() => {
        expect(screen.getByTestId(DASHBOARD_TESTID)).toBeInTheDocument();
      });
      expect(screen.queryByTestId("v3-placeholder")).not.toBeInTheDocument();
      expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
    },
  );

  it.each(V3_GUARDED_ROUTE_PATHS.map((path) => `/${path}`))(
    "redirects a deep link under %s, not just the section root, when the flag is off",
    async (path) => {
      setV3Flag("false");
      renderAt(`${path}/some-deep-link`);

      await waitFor(() => {
        expect(screen.getByTestId(DASHBOARD_TESTID)).toBeInTheDocument();
      });
      expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
    },
  );

  it.each(["/liquidations"])(
    "renders a placeholder at %s when the flag is on, not the dashboard",
    async (path) => {
      setV3Flag("true");
      renderAt(path);

      await waitFor(() => {
        expect(screen.getByTestId("v3-placeholder")).toBeInTheDocument();
      });
      expect(screen.queryByTestId(DASHBOARD_TESTID)).not.toBeInTheDocument();
      expect(
        screen.queryByTestId(RESERVE_DETAIL_TESTID),
      ).not.toBeInTheDocument();
    },
  );

  it("renders the vaults page at /vaults when the flag is on, not the dashboard", async () => {
    setV3Flag("true");
    renderAt("/vaults");

    await waitFor(() => {
      expect(screen.getByTestId(VAULTS_PAGE_TESTID)).toBeInTheDocument();
    });
    expect(screen.queryByTestId(DASHBOARD_TESTID)).not.toBeInTheDocument();
    expect(screen.queryByTestId(RESERVE_DETAIL_TESTID)).not.toBeInTheDocument();
  });

  it("renders the Loans page at /loans when the flag is on, not the dashboard or a placeholder", async () => {
    setV3Flag("true");
    renderAt("/loans");

    await waitFor(() => {
      expect(screen.getByTestId(LOANS_TESTID)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("v3-placeholder")).not.toBeInTheDocument();
    expect(screen.queryByTestId(DASHBOARD_TESTID)).not.toBeInTheDocument();
  });

  it.each(["/app/aave/reserve/usdc/borrow", "/vaults/details"])(
    "rejects the nested path %s",
    async (path) => {
      setV3Flag("true");
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
});

describe("Router — reserve detail stays over the dashboard", () => {
  beforeEach(() => {
    setV3Flag("false");
    vi.clearAllMocks();
  });

  it("renders the reserve detail as an overlay over the dashboard", async () => {
    renderAt(getReserveDetailRoute("USDC", "borrow", false));

    await waitFor(() => {
      expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toBeInTheDocument();
    });
    expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
      "data-reserve-id",
      "usdc",
    );
    expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
      "data-tab",
      "borrow",
    );
    expect(screen.getByTestId(DASHBOARD_TESTID)).toBeInTheDocument();
  });

  it("defaults to borrow when the tab is omitted", async () => {
    renderAt("/?reserve=usdc");

    await waitFor(() => {
      expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
        "data-tab",
        "borrow",
      );
    });
  });
});

describe("Router — flag-aware reserve-detail routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("v2 (flag off): reserve detail at /", () => {
    beforeEach(() => {
      setV3Flag("false");
    });

    it("generates v2 reserve-detail URL (/ base)", () => {
      const route = getReserveDetailRoute("USDC", "borrow", false);
      expect(route).toBe("/?reserve=usdc&tab=borrow");
    });

    it("renders reserve detail overlay over dashboard at / with query params", async () => {
      renderAt("/?reserve=usdc&tab=repay");

      await waitFor(() => {
        expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toBeInTheDocument();
      });
      expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
        "data-reserve-id",
        "usdc",
      );
      expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
        "data-tab",
        "repay",
      );
      expect(screen.getByTestId(DASHBOARD_TESTID)).toBeInTheDocument();
    });
  });

  describe("v3 (flag on): reserve detail at /loans", () => {
    beforeEach(() => {
      setV3Flag("true");
    });

    it("generates v3 reserve-detail URL (/loans base)", () => {
      const route = getReserveDetailRoute("USDC", "borrow", true);
      expect(route).toBe("/loans?reserve=usdc&tab=borrow");
    });

    it("renders reserve detail overlay when /loans has reserve query params", async () => {
      renderAt("/loans?reserve=usdc&tab=repay");

      await waitFor(() => {
        expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toBeInTheDocument();
      });
      expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
        "data-reserve-id",
        "usdc",
      );
      expect(screen.getByTestId(RESERVE_DETAIL_TESTID)).toHaveAttribute(
        "data-tab",
        "repay",
      );
    });
  });
  describe("wrong base route: flag-off + /loans query params", () => {
    beforeEach(() => {
      setV3Flag("false");
    });

    it("does NOT open reserve detail overlay on /loans when flag is off", async () => {
      renderAt("/loans?reserve=usdc&tab=repay");

      await waitFor(() => {
        expect(screen.getByTestId(DASHBOARD_TESTID)).toBeInTheDocument();
      });
      expect(
        screen.queryByTestId(RESERVE_DETAIL_TESTID),
      ).not.toBeInTheDocument();
    });
  });

  describe("wrong base route: flag-on + / query params", () => {
    beforeEach(() => {
      setV3Flag("true");
    });

    it("does NOT open reserve detail overlay on / when flag is on", async () => {
      renderAt("/?reserve=usdc&tab=repay");

      await waitFor(() => {
        expect(screen.getByTestId(DASHBOARD_TESTID)).toBeInTheDocument();
      });
      expect(
        screen.queryByTestId(RESERVE_DETAIL_TESTID),
      ).not.toBeInTheDocument();
    });
  });

  describe("wrong base route: flag-on + /vaults query params", () => {
    beforeEach(() => {
      setV3Flag("true");
    });

    it("does NOT open reserve detail overlay on /vaults when flag is on", async () => {
      renderAt("/vaults?reserve=usdc&tab=repay");

      await waitFor(() => {
        expect(screen.getByTestId(VAULTS_PAGE_TESTID)).toBeInTheDocument();
      });
      expect(
        screen.queryByTestId(RESERVE_DETAIL_TESTID),
      ).not.toBeInTheDocument();
    });
  });
  it.each([
    { flag: "true", label: "v3 (flag on)" },
    { flag: "false", label: "v2 (flag off)" },
    { flag: undefined, label: "default (flag undefined)" },
  ])(
    "rejects old v2 reserve-detail path (/app/aave/reserve/...) when $label",
    async ({ flag }) => {
      setV3Flag(flag);
      renderAt("/app/aave/reserve/usdc/borrow");

      await waitFor(() => {
        expect(screen.getByTestId("not-found")).toBeInTheDocument();
      });
    },
  );
});
