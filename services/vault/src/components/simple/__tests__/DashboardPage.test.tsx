import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { setDebugHealthFactorOverride } from "@/dev/debugPositionStore";

import { DashboardPage } from "../DashboardPage";

const featureFlagsMock = vi.hoisted(() => ({
  isV3UiEnabled: false,
  isLiquidationNotificationsEnabled: false,
  isGodModePanelEnabled: false,
  isPositionDebugPanelEnabled: false,
}));

vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
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

vi.mock("@/dev/debugPositionStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dev/debugPositionStore")>()),
  useDebugPositionOverride: () => ({ result: null, status: null }),
  useDebugManualMode: () => false,
}));

vi.mock("@/dev/demoDeposit", () => ({
  useDemoCollateral: () => null,
  useDemoWithdrawal: () => null,
}));

vi.mock("@/applications/aave/context", () => ({
  useSyncPendingVaults: () => undefined,
}));

vi.mock("@/applications/aave/hooks", () => ({
  useAaveVaults: () => ({ vaults: [], redeemedVaults: [] }),
}));

vi.mock("@/applications/aave/hooks/usePositionNotifications", () => ({
  usePositionNotifications: () => ({ result: null }),
}));

vi.mock("../OverviewSection", () => ({
  OverviewSection: () => <div data-testid="overview-section" />,
}));
vi.mock("../CollateralSection", () => ({
  CollateralSection: () => <div data-testid="collateral-section" />,
}));
vi.mock("../LoansSection", () => ({
  LoansSection: () => <div data-testid="loans-section" />,
}));
vi.mock("../SupplyCapSection", () => ({
  SupplyCapSection: () => <div data-testid="supply-cap" />,
}));
vi.mock("../MaxVaultsNotification", () => ({
  MaxVaultsNotification: () => <div data-testid="max-vaults" />,
}));
vi.mock("../PendingDepositSection", () => ({
  PendingDepositSection: () => <div data-testid="pending-deposits" />,
}));
vi.mock("../PendingWithdrawSection", () => ({
  PendingWithdrawSection: () => <div data-testid="pending-withdrawals" />,
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
vi.mock("@/components/shared", () => ({
  HeartIcon: () => null,
}));
vi.mock("../WithdrawFlow", () => ({ default: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  featureFlagsMock.isV3UiEnabled = false;
  featureFlagsMock.isLiquidationNotificationsEnabled = false;
  featureFlagsMock.isGodModePanelEnabled = false;
  pricesMock.prices = {};
  pricesMock.metadata = {};
  setDebugHealthFactorOverride(null);
});

describe("DashboardPage v3 composition", () => {
  it("renders every legacy section when the v3 flag is off", () => {
    render(<DashboardPage />);

    expect(screen.getByTestId("collateral-section")).toBeInTheDocument();
    expect(screen.getByTestId("loans-section")).toBeInTheDocument();
    expect(screen.getByTestId("supply-cap")).toBeInTheDocument();
    expect(screen.getByTestId("pending-deposits")).toBeInTheDocument();
    expect(screen.getAllByTestId("pending-withdrawals")).toHaveLength(2);
  });

  it("shows only the overview summary in v3, hiding cap, pending, collateral, and loans while keeping safety notifications", () => {
    featureFlagsMock.isV3UiEnabled = true;
    featureFlagsMock.isLiquidationNotificationsEnabled = true;

    render(<DashboardPage />);

    expect(screen.getByTestId("overview-section")).toBeInTheDocument();
    expect(screen.getByTestId("max-vaults")).toBeInTheDocument();
    expect(screen.getByTestId("critical-banner")).toBeInTheDocument();
    expect(screen.getByTestId("position-banner")).toBeInTheDocument();
    expect(screen.getByText(COPY.risk.title)).toBeInTheDocument();

    expect(screen.queryByTestId("collateral-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("loans-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("supply-cap")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pending-deposits")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pending-withdrawals")).not.toBeInTheDocument();
  });
});

describe("DashboardPage risk card under a forced health factor", () => {
  beforeEach(() => {
    featureFlagsMock.isV3UiEnabled = true;
    featureFlagsMock.isGodModePanelEnabled = true;
    pricesMock.prices = { BTC: 63488 };
    pricesMock.metadata = { BTC: { isStale: false, fetchFailed: false } };
  });

  it("charts the liquidation price and distance implied by the forced value", () => {
    setDebugHealthFactorOverride(2.4);

    render(<DashboardPage />);

    // 63,488 / 2.4, in both the stat cell and the rail's marker label, plus
    // the distance it implies: 100 * (1 - 1 / 2.4).
    expect(screen.getAllByText("$26,453")).toHaveLength(2);
    expect(screen.getByText("58.3%")).toBeInTheDocument();
  });

  it("clamps the distance to zero when the forced value is below 1", () => {
    setDebugHealthFactorOverride(0.95);

    render(<DashboardPage />);

    expect(screen.getAllByText("$66,829")).toHaveLength(2);
    expect(screen.getByText("0.0%")).toBeInTheDocument();
  });

  it("shows placeholders rather than live stats when no usable BTC price backs the forced value", () => {
    pricesMock.metadata = { BTC: { isStale: true, fetchFailed: false } };
    setDebugHealthFactorOverride(2.4);

    render(<DashboardPage />);

    expect(
      screen.getAllByText(COPY.common.emptyValue).length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("58.3%")).not.toBeInTheDocument();
  });
});
