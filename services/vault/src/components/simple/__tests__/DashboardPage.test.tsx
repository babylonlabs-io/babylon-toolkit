import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { calculate } from "@/applications/aave/positionNotifications";
import type {
  CalculatorParams,
  CalculatorResult,
} from "@/applications/aave/positionNotifications/types";
import { COPY } from "@/copy";
import { setHealthFactorOverride } from "@/overrides/borrowCapacity";
import { setPositionCascadeOverride } from "@/overrides/position";

import { DashboardPage } from "../DashboardPage";

const featureFlagsMock = vi.hoisted(() => ({
  isLiquidationNotificationsEnabled: false,
  isGodModePanelEnabled: false,
  isPositionDebugPanelEnabled: false,
  isLiquidationAnalysisChartEnabled: false,
}));

vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  // The borrow/repay entry points read the current pathname so the flow opens
  // in place instead of routing to /loans (see useLoanActions).
  useLocation: () => ({ pathname: "/", search: "" }),
  useOutletContext: () => ({ openDeposit: vi.fn() }),
}));

vi.mock("@/context/wallet", () => ({
  useConnection: () => ({ isConnected: true }),
  useETHWallet: () => ({ address: "0xabc" }),
}));

vi.mock("@/hooks/useDashboardState", () => ({
  useDashboardState: () => ({
    collateralBtc: 0,
    displayCollateralBtc: 0,
    collateralValueUsd: 0,
    debtValueUsd: 0,
    maxTotalDebtUsd: 0,
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
  }),
}));

vi.mock("@/hooks/useApplicationCap", () => ({
  useApplicationCap: () => ({ snapshot: null, isLoading: false }),
}));

vi.mock("@/hooks/usePegoutPolling", () => ({
  usePegoutPolling: () => ({ pegoutStatuses: new Map() }),
}));

const pricesMock = vi.hoisted(() => ({
  prices: {} as Record<string, number>,
  metadata: {} as Record<string, { isStale: boolean; fetchFailed: boolean }>,
}));

vi.mock("@/hooks/usePrices", () => ({
  usePrices: () => pricesMock,
}));

vi.mock("@/dev/demoDeposit", () => ({
  useDemoCollateral: () => null,
}));

vi.mock("@/applications/aave/context", () => ({
  useSyncPendingVaults: () => undefined,
}));

vi.mock("@/applications/aave/hooks", () => ({
  useAaveVaults: () => ({ vaults: [], redeemedVaults: [] }),
}));

const positionNotificationsMock = vi.hoisted(() => ({
  result: null as CalculatorResult | null,
  params: null as CalculatorParams | null,
}));

vi.mock("@/applications/aave/hooks/usePositionNotifications", () => ({
  usePositionNotifications: () => positionNotificationsMock,
}));

vi.mock("../OverviewSection", () => ({
  OverviewSection: () => <div data-testid="overview-section" />,
}));
vi.mock("../MaxVaultsNotification", () => ({
  MaxVaultsNotification: () => <div data-testid="max-vaults" />,
}));
vi.mock("../PositionNotificationBanner", () => ({
  PositionNotificationBanner: () => <div data-testid="position-banner" />,
}));
vi.mock("../CriticalLiquidationTopBanner", () => ({
  CriticalLiquidationTopBanner: () => <div data-testid="critical-banner" />,
}));
vi.mock("../DisconnectedOverview", () => ({
  DisconnectedOverview: () => null,
}));
vi.mock("../LiquidationAnalysisSection", () => ({
  LiquidationAnalysisSection: ({
    cascade,
  }: {
    cascade?: {
      btcPrice: number;
      collateralFactor: number;
      vaultsTotal: number;
    } | null;
  }) => (
    <div
      data-testid="liquidation-analysis"
      data-cascade={cascade ? "yes" : "no"}
      data-btc-price={cascade?.btcPrice ?? ""}
      data-collateral-factor={cascade?.collateralFactor ?? ""}
      data-vaults-total={cascade?.vaultsTotal ?? ""}
    />
  ),
}));
vi.mock("@/components/shared", () => ({
  HeartIcon: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  featureFlagsMock.isLiquidationNotificationsEnabled = false;
  featureFlagsMock.isGodModePanelEnabled = false;
  featureFlagsMock.isLiquidationAnalysisChartEnabled = false;
  positionNotificationsMock.result = null;
  positionNotificationsMock.params = null;
  setPositionCascadeOverride(null);
  pricesMock.prices = {};
  pricesMock.metadata = {};
  setHealthFactorOverride(null);
});

describe("DashboardPage composition", () => {
  it("renders the overview summary, the risk card and the safety notifications", () => {
    featureFlagsMock.isLiquidationNotificationsEnabled = true;

    render(<DashboardPage />);

    expect(screen.getByTestId("overview-section")).toBeInTheDocument();
    expect(screen.getByTestId("max-vaults")).toBeInTheDocument();
    expect(screen.getByTestId("critical-banner")).toBeInTheDocument();
    expect(screen.getByTestId("position-banner")).toBeInTheDocument();
    expect(screen.getByText(COPY.risk.title)).toBeInTheDocument();
  });
});

describe("DashboardPage risk card under a forced health factor", () => {
  beforeEach(() => {
    featureFlagsMock.isGodModePanelEnabled = true;
    pricesMock.prices = { BTC: 63488 };
    pricesMock.metadata = { BTC: { isStale: false, fetchFailed: false } };
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
    pricesMock.metadata = { BTC: { isStale: true, fetchFailed: false } };
    setHealthFactorOverride(2.4);

    render(<DashboardPage />);

    expect(
      screen.getAllByText(COPY.common.emptyValue).length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("58.3%")).not.toBeInTheDocument();
  });
});

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
  maxLB: 1.05,
};
const LIVE_RESULT = calculate(LIVE_PARAMS);

const OVERRIDE_PARAMS: CalculatorParams = {
  btcPrice: 88_400,
  totalDebtUsd: 28_383,
  vaults: [{ id: "gm-1", name: "Vault 1", btc: 0.6 }],
  CF: 0.5,
  THF: 1.1,
  maxLB: 1.05,
};
const OVERRIDE_RESULT = calculate(OVERRIDE_PARAMS);

describe("DashboardPage embedded liquidation preview", () => {
  beforeEach(() => {
    featureFlagsMock.isLiquidationAnalysisChartEnabled = true;
  });

  it("charts the live position cascade built from the live calculator params", () => {
    positionNotificationsMock.result = LIVE_RESULT;
    positionNotificationsMock.params = LIVE_PARAMS;

    render(<DashboardPage />);

    const section = screen.getByTestId("liquidation-analysis");
    expect(section).toHaveAttribute("data-cascade", "yes");
    expect(section).toHaveAttribute("data-btc-price", "61722.5");
    expect(section).toHaveAttribute("data-collateral-factor", "0.75");
    expect(section).toHaveAttribute("data-vaults-total", "2");
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
  });

  it("charts nothing when neither the override nor the live position has a result", () => {
    render(<DashboardPage />);

    expect(screen.getByTestId("liquidation-analysis")).toHaveAttribute(
      "data-cascade",
      "no",
    );
  });

  it("charts nothing with the flag off, even with a live cascade", () => {
    featureFlagsMock.isLiquidationAnalysisChartEnabled = false;
    positionNotificationsMock.result = LIVE_RESULT;
    positionNotificationsMock.params = LIVE_PARAMS;

    render(<DashboardPage />);

    expect(screen.getByTestId("liquidation-analysis")).toHaveAttribute(
      "data-cascade",
      "no",
    );
  });
});
