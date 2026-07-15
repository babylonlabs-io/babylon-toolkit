import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    isBorrowCapacityLoading: false,
    healthFactor: 0,
    healthFactorStatus: "safe",
    borrowedAssets: [],
    hasLoans: true,
    hasCollateral: true,
    hasDisplayCollateral: true,
    collateralVaults: [],
    selectableBorrowedAssets: [],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useApplicationCap", () => ({
  useApplicationCap: () => ({ snapshot: null, isLoading: false }),
}));

vi.mock("@/hooks/usePegoutPolling", () => ({
  usePegoutPolling: () => ({ pegoutStatuses: new Map() }),
}));

vi.mock("@/hooks/usePrices", () => ({
  usePrices: () => ({ prices: {}, metadata: {} }),
}));

vi.mock("@/dev/debugPositionStore", () => ({
  useDebugPositionOverride: () => ({ result: null, status: null }),
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

vi.mock("@/applications/aave/components/AssetSelectionModal", () => ({
  AssetSelectionModal: () => null,
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
vi.mock("../WithdrawFlow", () => ({ default: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  featureFlagsMock.isV3UiEnabled = false;
  featureFlagsMock.isLiquidationNotificationsEnabled = false;
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

    expect(screen.queryByTestId("collateral-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("loans-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("supply-cap")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pending-deposits")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pending-withdrawals")).not.toBeInTheDocument();
  });
});
