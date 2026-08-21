import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { setHealthFactorOverride } from "@/overrides/borrowCapacity";

import { DashboardPage } from "../DashboardPage";

const featureFlagsMock = vi.hoisted(() => ({
  isLiquidationNotificationsEnabled: false,
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

vi.mock("@/applications/aave/hooks/usePositionNotifications", () => ({
  usePositionNotifications: () => ({ result: null }),
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
vi.mock("@/components/shared", () => ({
  HeartIcon: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  featureFlagsMock.isLiquidationNotificationsEnabled = false;
  featureFlagsMock.isGodModePanelEnabled = false;
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
