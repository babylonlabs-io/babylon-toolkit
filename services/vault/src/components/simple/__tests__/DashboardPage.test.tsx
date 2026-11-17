import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  calculate,
  type Warning,
} from "@/applications/aave/positionNotifications";
import type {
  CalculatorParams,
  CalculatorResult,
} from "@/applications/aave/positionNotifications/types";
import { COPY } from "@/copy";
import { useDashboardState } from "@/hooks/useDashboardState";
import { setHealthFactorOverride } from "@/overrides/borrowCapacity";
import { setLiquidationCardOverride } from "@/overrides/liquidations";
import { setPositionCascadeOverride } from "@/overrides/position";
import { formatUsdPrice } from "@/utils/formatting";

import { DashboardPage } from "../DashboardPage";

const featureFlagsMock = vi.hoisted(() => ({
  isGodModePanelEnabled: false,
  isPositionDebugPanelEnabled: false,
}));

vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  // The borrow/repay entry points read the current pathname so the flow opens
  // in place instead of routing to /loans (see useLoanActions).
  useLocation: () => ({ pathname: "/", search: "" }),
  useOutletContext: () => ({ openDeposit: vi.fn() }),
}));

const walletMock = vi.hoisted(() => ({
  btcConnected: true,
  ethConnected: true,
  confirmed: true,
}));

vi.mock("@babylonlabs-io/wallet-connector/btc-eth", () => ({
  useWalletConnect: () => ({ connected: walletMock.confirmed }),
  useBTCWallet: () => ({ connected: walletMock.btcConnected }),
  useETHWallet: () => ({
    connected: walletMock.ethConnected,
    address: "0xabc",
  }),
}));

vi.mock("@/context/wallet", async () => ({
  useConnection: (await import("@/context/wallet/useConnection")).useConnection,
  useETHWallet: (await import("@babylonlabs-io/wallet-connector/btc-eth"))
    .useETHWallet,
}));

const dashboardStateMock = vi.hoisted(() => ({
  overrides: {} as Record<string, unknown>,
}));

vi.mock("@/hooks/useDashboardState", () => ({
  useDashboardState: vi.fn(() => ({
    collateralBtc: 0,
    displayCollateralBtc: 0,
    collateralValueUsd: 0,
    debtValueUsd: 0,
    availableToBorrowUsd: 0,
    collateralFactorBps: 7800,
    isBorrowCapacityLoading: false,
    borrowCapacityError: null,
    healthFactor: 0,
    healthFactorStatus: "safe",
    borrowedAssets: [],
    hasLoans: true,
    hasCollateral: true,
    hasDisplayCollateral: true,
    collateralVaults: [],
    isLoading: false,
    isPositionUnavailable: false,
    ...dashboardStateMock.overrides,
  })),
}));

vi.mock("@/hooks/useApplicationCap", () => ({
  useApplicationCap: () => ({ snapshot: null, isLoading: false }),
}));

vi.mock("@/dev/demoDeposit", () => ({
  useDemoCollateral: () => null,
}));

vi.mock("@/applications/aave/context", () => ({
  useSyncPendingVaults: () => undefined,
  useAaveConfig: () => ({
    maxBorrowReserves: { status: "loaded", limit: 1 },
  }),
}));

vi.mock("@/applications/aave/hooks", () => ({
  useAaveVaults: () => ({ vaults: [] }),
}));

const positionNotificationsMock = vi.hoisted(() => ({
  result: null as CalculatorResult | null,
  liveUrgentWarning: null as Warning | null,
  params: null as CalculatorParams | null,
  btcPriceUsd: null as number | null,
}));

vi.mock("@/applications/aave/hooks/usePositionNotifications", () => ({
  usePositionNotifications: () => positionNotificationsMock,
}));

vi.mock("../OverviewSection", () => ({
  OverviewSection: ({
    totalCollateralValue,
    collateralBtc,
    availableToBorrow,
    borrowCount,
  }: {
    totalCollateralValue: string;
    collateralBtc: string;
    availableToBorrow: string;
    borrowCount: bigint | null;
  }) => (
    <div
      data-testid="overview-section"
      data-total-collateral={totalCollateralValue}
      data-collateral-btc={collateralBtc}
      data-available-to-borrow={availableToBorrow}
      data-borrow-count={String(borrowCount)}
    />
  ),
}));
vi.mock("../MaxVaultsNotification", () => ({
  MaxVaultsNotification: () => <div data-testid="max-vaults" />,
}));
vi.mock("../PositionNotificationBanner", () => ({
  PositionNotificationBanner: () => <div data-testid="position-banner" />,
}));
vi.mock("../CriticalLiquidationTopBanner", () => ({
  CriticalLiquidationTopBanner: ({
    liveUrgentWarning,
  }: {
    liveUrgentWarning?: Warning | null;
  }) => <div data-testid="critical-banner">{liveUrgentWarning?.title}</div>,
}));
vi.mock("../DisconnectedOverview", () => ({
  DisconnectedOverview: () => <div data-testid="disconnected-overview" />,
}));
// Captures the raw cascade prop so tests can assert on the *identity* of the
// CalculatorResult that reached the section, not just values re-derived from
// it — a regression that pairs an override's params with the live result
// (or vice versa) would otherwise slip past scalar-only assertions.
const receivedCascade = vi.hoisted(() => ({
  current: null as {
    result: CalculatorResult;
    params: CalculatorParams;
  } | null,
}));

vi.mock("../LiquidationAnalysisSection", () => ({
  LiquidationAnalysisSection: ({
    cascade,
    isPositionUnavailable,
  }: {
    cascade?: {
      result: CalculatorResult;
      params: CalculatorParams;
    } | null;
    isPositionUnavailable: boolean;
  }) => {
    receivedCascade.current = cascade ?? null;
    return (
      <div
        data-testid="liquidation-analysis"
        data-position-unavailable={String(isPositionUnavailable)}
        data-cascade={cascade ? "yes" : "no"}
        data-btc-price={cascade?.params.btcPrice ?? ""}
        data-collateral-factor={cascade?.params.CF ?? ""}
        data-vaults-total={cascade?.params.vaults.length ?? ""}
        data-current-hf={cascade?.result.currentHF ?? ""}
      />
    );
  },
}));
vi.mock("@/components/shared", () => ({
  HeartIcon: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  walletMock.btcConnected = true;
  walletMock.ethConnected = true;
  walletMock.confirmed = true;
  featureFlagsMock.isGodModePanelEnabled = false;
  positionNotificationsMock.result = null;
  positionNotificationsMock.liveUrgentWarning = null;
  positionNotificationsMock.params = null;
  positionNotificationsMock.btcPriceUsd = null;
  dashboardStateMock.overrides = {};
  setPositionCascadeOverride(null);
  setHealthFactorOverride(null);
  setLiquidationCardOverride(null);
  receivedCascade.current = null;
});

describe("DashboardPage composition", () => {
  it("passes live risk to the top banner when no cascade is available", () => {
    const title = COPY.liquidationWarnings.liveHealthFactor.title("1.05");
    positionNotificationsMock.liveUrgentWarning = {
      type: "urgent",
      title,
      detail: COPY.liquidationWarnings.liveHealthFactor.detail,
    };
    render(<DashboardPage />);
    expect(screen.getByTestId("critical-banner")).toHaveTextContent(title);
    expect(receivedCascade.current).toBeNull();
  });

  it("shows the landing page when both wallets are missing", () => {
    walletMock.btcConnected = false;
    walletMock.ethConnected = false;

    render(<DashboardPage />);

    expect(screen.getByTestId("disconnected-overview")).toBeInTheDocument();
    expect(screen.queryByTestId("overview-section")).not.toBeInTheDocument();
    expect(useDashboardState).toHaveBeenCalledWith(undefined);
  });

  it("shows the landing page when only Bitcoin is connected", () => {
    walletMock.btcConnected = true;
    walletMock.ethConnected = false;

    render(<DashboardPage />);

    expect(screen.getByTestId("disconnected-overview")).toBeInTheDocument();
    expect(screen.queryByTestId("overview-section")).not.toBeInTheDocument();
    expect(useDashboardState).toHaveBeenCalledWith(undefined);
  });

  it("opens the connected overview when only Ethereum is connected", () => {
    walletMock.btcConnected = false;
    walletMock.ethConnected = true;

    render(<DashboardPage />);

    expect(screen.getByTestId("overview-section")).toBeInTheDocument();
    expect(
      screen.queryByTestId("disconnected-overview"),
    ).not.toBeInTheDocument();
    expect(useDashboardState).toHaveBeenCalledWith("0xabc");
  });

  it("waits for consent before it loads the connected dashboard", () => {
    walletMock.confirmed = false;
    const { rerender } = render(<DashboardPage />);
    expect(screen.getByTestId("disconnected-overview")).toBeInTheDocument();
    expect(useDashboardState).toHaveBeenLastCalledWith(undefined);

    walletMock.confirmed = true;
    rerender(<DashboardPage />);
    expect(screen.getByTestId("overview-section")).toBeInTheDocument();
    expect(useDashboardState).toHaveBeenLastCalledWith("0xabc");
  });

  it("renders the overview summary, the risk card and the safety notifications", () => {
    render(<DashboardPage />);

    expect(screen.getByTestId("overview-section")).toBeInTheDocument();
    expect(screen.getByTestId("max-vaults")).toBeInTheDocument();
    expect(screen.getByTestId("critical-banner")).toBeInTheDocument();
    expect(screen.getByTestId("position-banner")).toBeInTheDocument();
    expect(screen.getByText(COPY.risk.title)).toBeInTheDocument();
    expect(useDashboardState).toHaveBeenCalledWith("0xabc");

    // Figma (10094-26791, 10204-45310): the max-vaults notice and the cascade
    // banner share the slot below Position, not above it.
    const overview = screen.getByTestId("overview-section");
    const maxVaults = screen.getByTestId("max-vaults");
    expect(
      overview.compareDocumentPosition(maxVaults) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("DashboardPage risk card under a forced health factor", () => {
  beforeEach(() => {
    featureFlagsMock.isGodModePanelEnabled = true;
    // The live Spoke price. There is no cascade: the forced value replaces
    // the cascade's own liquidation figures.
    positionNotificationsMock.btcPriceUsd = 63_488;
  });

  it("charts the liquidation price and distance implied by the forced value", () => {
    setHealthFactorOverride(2.4);

    render(<DashboardPage />);

    // 63,488 / 2.4, in both the stat cell and the rail's marker label, plus
    // the distance it implies: 100 * (1 - 1 / 2.4).
    expect(screen.getAllByText("$26,453")).toHaveLength(2);
    expect(screen.getByText("58.3%")).toBeInTheDocument();
  });

  it("clamps the distance to zero when the forced value is below 1", () => {
    setHealthFactorOverride(0.95);

    render(<DashboardPage />);

    expect(screen.getAllByText("$66,829")).toHaveLength(2);
    expect(screen.getByText("0.0%")).toBeInTheDocument();
  });

  it("shows placeholders rather than live stats when no usable BTC price backs the forced value", () => {
    positionNotificationsMock.btcPriceUsd = null;
    setHealthFactorOverride(2.4);

    render(<DashboardPage />);

    expect(
      screen.getAllByText(COPY.common.emptyValue).length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("58.3%")).not.toBeInTheDocument();
  });
});

// A flat bonus: 105% at every health factor.
const FLAT_BONUS_CURVE = {
  healthFactorForMaxBonus: 0n,
  liquidationBonusFactor: 10_000n,
  maxLiquidationBonus: 10_500n,
};

// A real 2-vault position and a deliberately differently-shaped 1-vault
// god-mode cascade, so which one reached the chart is unambiguous.
const LIVE_PARAMS: CalculatorParams = {
  btcPrice: 61_722.5,
  totalDebtUsd: 44_287.72,
  vaults: [
    { id: "vault-1", name: "Vault 1", btc: 0.65 },
    { id: "vault-2", name: "Vault 2", btc: 0.35 },
  ],
  CF: 0.75,
  THF: 1.1,
  LB: 1.05,
  bonusCurve: FLAT_BONUS_CURVE,
  expectedHF: 0.95,
  minPeginBtc: 0.0005,
};
const LIVE_RESULT = calculate(LIVE_PARAMS);

const OVERRIDE_PARAMS: CalculatorParams = {
  btcPrice: 88_400,
  totalDebtUsd: 28_383,
  vaults: [{ id: "gm-1", name: "Vault 1", btc: 0.6 }],
  CF: 0.5,
  THF: 1.1,
  LB: 1.05,
  bonusCurve: FLAT_BONUS_CURVE,
  expectedHF: 0.95,
  minPeginBtc: 0.0005,
};
const OVERRIDE_RESULT = calculate(OVERRIDE_PARAMS);

describe("DashboardPage embedded liquidation preview", () => {
  it("charts the live position cascade built from the live calculator params", () => {
    positionNotificationsMock.result = LIVE_RESULT;
    positionNotificationsMock.params = LIVE_PARAMS;

    render(<DashboardPage />);

    const section = screen.getByTestId("liquidation-analysis");
    expect(section).toHaveAttribute("data-cascade", "yes");
    expect(section).toHaveAttribute("data-btc-price", "61722.5");
    expect(section).toHaveAttribute("data-collateral-factor", "0.75");
    expect(section).toHaveAttribute("data-vaults-total", "2");
    expect(section).toHaveAttribute(
      "data-current-hf",
      String(LIVE_RESULT.currentHF),
    );
    // Identity, not just value — catches a regression that recomputes a
    // result matching LIVE_RESULT's numbers from the wrong params.
    expect(receivedCascade.current?.result).toBe(LIVE_RESULT);
  });

  it("prefers the god-mode cascade over the live one", () => {
    // The override store reads through the god-mode gate, so the panel flag
    // has to be on for a published override to be visible at all.
    featureFlagsMock.isGodModePanelEnabled = true;
    positionNotificationsMock.result = LIVE_RESULT;
    positionNotificationsMock.params = LIVE_PARAMS;
    setPositionCascadeOverride({
      result: OVERRIDE_RESULT,
      status: null,
      params: OVERRIDE_PARAMS,
    });

    render(<DashboardPage />);

    const section = screen.getByTestId("liquidation-analysis");
    expect(section).toHaveAttribute("data-btc-price", "88400");
    expect(section).toHaveAttribute("data-vaults-total", "1");
    expect(section).toHaveAttribute(
      "data-current-hf",
      String(OVERRIDE_RESULT.currentHF),
    );
    // The override's params must never pair with the live result.
    expect(receivedCascade.current?.result).toBe(OVERRIDE_RESULT);
    expect(receivedCascade.current?.result).not.toBe(LIVE_RESULT);
  });

  it("falls through to the live cascade for a status-only override", () => {
    featureFlagsMock.isGodModePanelEnabled = true;
    positionNotificationsMock.result = LIVE_RESULT;
    positionNotificationsMock.params = LIVE_PARAMS;
    setPositionCascadeOverride({
      result: null,
      status: "stale-price",
      params: OVERRIDE_PARAMS,
    });

    render(<DashboardPage />);

    const section = screen.getByTestId("liquidation-analysis");
    expect(section).toHaveAttribute("data-btc-price", "61722.5");
    expect(section).toHaveAttribute("data-vaults-total", "2");
    expect(section).toHaveAttribute(
      "data-current-hf",
      String(LIVE_RESULT.currentHF),
    );
    // A status-only override carries no result — the section must still get
    // the live result, never the override's (unset) one.
    expect(receivedCascade.current?.result).toBe(LIVE_RESULT);
    expect(receivedCascade.current?.result).not.toBe(OVERRIDE_RESULT);
  });

  it("charts nothing when neither the override nor the live position has a result", () => {
    render(<DashboardPage />);

    expect(screen.getByTestId("liquidation-analysis")).toHaveAttribute(
      "data-cascade",
      "no",
    );
  });
});

describe("DashboardPage with the position unavailable", () => {
  const NOTICE_TEST_ID = "position-unavailable-notice";
  // The first read failed: nothing cached, so these are the hook's zeros.
  const FIRST_READ_FAILED = {
    position: null,
    hasCollateral: false,
    hasLoans: false,
    isPositionUnavailable: true,
  };
  // Reads kept failing past the threshold: the last good position is cached.
  const CACHED_READ_STALE = {
    position: { accountData: { borrowCount: 1n } },
    collateralValueUsd: 80_000,
    availableToBorrowUsd: 5_000,
    collateralBtc: 1,
    healthFactor: 2.1,
    healthFactorStatus: "safe",
    isPositionUnavailable: true,
  };

  it("shows a notice with no way to dismiss it", () => {
    dashboardStateMock.overrides = FIRST_READ_FAILED;

    render(<DashboardPage />);

    const notice = screen.getByTestId(NOTICE_TEST_ID);
    expect(notice).toHaveTextContent(
      COPY.liquidationWarnings.positionUnavailable.title,
    );
    expect(notice).toHaveTextContent(
      COPY.liquidationWarnings.positionUnavailable.detail,
    );
    expect(notice.querySelector("button")).toBeNull();
  });

  it("removes the notice once a read succeeds", () => {
    dashboardStateMock.overrides = FIRST_READ_FAILED;
    const { rerender } = render(<DashboardPage />);
    expect(screen.getByTestId(NOTICE_TEST_ID)).toBeInTheDocument();

    dashboardStateMock.overrides = {};
    rerender(<DashboardPage />);

    expect(screen.queryByTestId(NOTICE_TEST_ID)).not.toBeInTheDocument();
  });

  it("keeps an urgent warning ahead of the notice", () => {
    dashboardStateMock.overrides = CACHED_READ_STALE;

    render(<DashboardPage />);

    expect(
      screen
        .getByTestId("position-banner")
        .compareDocumentPosition(screen.getByTestId(NOTICE_TEST_ID)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows placeholders, not an empty account, when the first read failed", () => {
    dashboardStateMock.overrides = FIRST_READ_FAILED;

    render(<DashboardPage />);

    const overview = screen.getByTestId("overview-section");
    expect(overview.dataset.totalCollateral).toBe(COPY.common.emptyValue);
    expect(overview.dataset.collateralBtc).toBe(COPY.common.emptyValue);
    expect(overview.dataset.availableToBorrow).toBe(COPY.common.emptyValue);
    expect(screen.getByText(COPY.risk.status.unavailable)).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.risk.status.noPosition),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("liquidation-analysis").dataset.positionUnavailable,
    ).toBe("true");
  });

  it("withholds a collateral factor that isn't the position's when the first read failed", () => {
    dashboardStateMock.overrides = FIRST_READ_FAILED;

    render(<DashboardPage />);

    expect(screen.queryByText("78%")).not.toBeInTheDocument();
  });

  it("keeps a cached position's overview figures next to the notice", () => {
    dashboardStateMock.overrides = CACHED_READ_STALE;

    render(<DashboardPage />);

    expect(screen.getByTestId(NOTICE_TEST_ID)).toBeInTheDocument();
    const overview = screen.getByTestId("overview-section");
    expect(overview.dataset.totalCollateral).not.toBe(COPY.common.emptyValue);
    expect(overview.dataset.availableToBorrow).not.toBe(COPY.common.emptyValue);
    expect(screen.getByText("78%")).toBeInTheDocument();
  });

  it("claims no borrow count for an account last read as empty, while its first failing fetch retries", () => {
    dashboardStateMock.overrides = {
      ...FIRST_READ_FAILED,
      positionError: null,
    };

    render(<DashboardPage />);

    expect(screen.getByTestId("overview-section").dataset.borrowCount).toBe(
      "null",
    );
  });

  it("leaves a god-mode cascade charted", () => {
    featureFlagsMock.isGodModePanelEnabled = true;
    dashboardStateMock.overrides = FIRST_READ_FAILED;
    setPositionCascadeOverride({
      result: OVERRIDE_RESULT,
      status: null,
      params: OVERRIDE_PARAMS,
    });

    render(<DashboardPage />);

    expect(screen.queryByTestId(NOTICE_TEST_ID)).not.toBeInTheDocument();
    expect(
      screen.getByTestId("liquidation-analysis").dataset.positionUnavailable,
    ).toBe("false");
  });

  it("leaves a god-mode liquidation card showing", () => {
    featureFlagsMock.isGodModePanelEnabled = true;
    dashboardStateMock.overrides = FIRST_READ_FAILED;
    setLiquidationCardOverride("no-loan");

    render(<DashboardPage />);

    expect(screen.queryByTestId(NOTICE_TEST_ID)).not.toBeInTheDocument();
    expect(
      screen.getByTestId("liquidation-analysis").dataset.positionUnavailable,
    ).toBe("false");
  });

  it("takes a cached position's health factor and liquidation figures off the risk card", () => {
    dashboardStateMock.overrides = CACHED_READ_STALE;
    positionNotificationsMock.btcPriceUsd = 60_000;
    // An urgent warning survives with its groups for the top banner; the risk
    // card must not read a liquidation price from them.
    positionNotificationsMock.result = calculate({
      btcPrice: 60_000,
      totalDebtUsd: 40_000,
      vaults: [{ id: "v-1", name: "Vault 1", btc: 1 }],
      CF: 0.75,
      THF: 1.1,
      LB: 1.05,
      bonusCurve: FLAT_BONUS_CURVE,
      expectedHF: 0.95,
      minPeginBtc: null,
    });
    const liquidationPrice = positionNotificationsMock.result.groups[0]
      ?.liquidationPrice as number;

    render(<DashboardPage />);

    expect(screen.getByText(COPY.risk.status.unavailable)).toBeInTheDocument();
    expect(screen.queryByText(COPY.risk.status.safe)).not.toBeInTheDocument();
    expect(screen.queryByText("2.10")).not.toBeInTheDocument();
    expect(screen.queryByText(formatUsdPrice(liquidationPrice))).toBeNull();
  });

  it("leaves a god-mode health factor showing", () => {
    featureFlagsMock.isGodModePanelEnabled = true;
    dashboardStateMock.overrides = FIRST_READ_FAILED;
    positionNotificationsMock.btcPriceUsd = 63_488;
    setHealthFactorOverride(2.4);

    render(<DashboardPage />);

    expect(screen.queryByTestId(NOTICE_TEST_ID)).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.risk.status.unavailable),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("$26,453")).toHaveLength(2);
  });
});

describe("DashboardPage risk card", () => {
  it("shows the Spoke BTC price with no position cascade to price", () => {
    // A connected depositor without active vaults: no cascade, but the
    // current BTC price is still known.
    positionNotificationsMock.btcPriceUsd = 61_722.5;

    render(<DashboardPage />);

    expect(screen.getAllByText("$61,723").length).toBeGreaterThanOrEqual(1);
  });
});
