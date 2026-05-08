import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("@/config/env", () => ({
  ENV: {
    BTC_VAULT_REGISTRY: "0x1234567890123456789012345678901234567890",
    AAVE_ADAPTER: "0x1234567890123456789012345678901234567890",
    GRAPHQL_ENDPOINT: "https://test.example.com/graphql",
  },
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  Network: {
    MAINNET: "mainnet",
    SIGNET: "signet",
    TESTNET: "testnet",
  },
}));

vi.mock("@/config/network", () => ({
  getNetworkConfigETH: vi.fn(() => ({
    chainId: 11155111,
    name: "sepolia",
  })),
  getNetworkConfigBTC: vi.fn(() => ({
    network: "signet",
    mempoolApiUrl: "https://mempool.space/signet/api",
    icon: "btc-icon",
    name: "sBTC",
    coinSymbol: "sBTC",
  })),
  getETHChain: vi.fn(() => ({
    id: 11155111,
    name: "Sepolia",
  })),
  getBTCNetwork: vi.fn(() => "signet"),
}));

const mockGetBTCNetwork = vi.fn(() => "signet"); // Default: Network.SIGNET

vi.mock("@/config", () => ({
  getBTCNetwork: () => mockGetBTCNetwork(),
  getNetworkConfigBTC: vi.fn(() => ({
    network: "signet",
    mempoolApiUrl: "https://mempool.space/signet/api",
    icon: "btc-icon",
    name: "sBTC",
    coinSymbol: "sBTC",
  })),
}));

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: vi.fn(() => ({})),
  },
}));

vi.mock("@/services/token/tokenService", () => ({
  getTokenByAddress: vi.fn(() => ({ icon: "usdc-icon" })),
  getCurrencyIconWithFallback: vi.fn(
    (icon: string | undefined) => icon ?? "fallback-icon",
  ),
}));

// Mock usePrices — returns Chainlink oracle prices
const mockUsePrices = vi.fn(() => ({
  prices: {} as Record<string, number>,
  metadata: {},
  isLoading: false,
  error: null as Error | null,
  hasStalePrices: false,
  hasPriceFetchError: false,
}));

vi.mock("@/hooks/usePrices", () => ({
  usePrices: () => mockUsePrices(),
}));

// Mock useAaveConfig
const mockUseAaveConfig = vi.fn(() => ({
  config: {
    coreSpokeAddress: "0xSpokeAddress",
    btcVaultCoreVbtcReserveId: 1n,
  },
  vbtcReserve: {
    reserveId: 1n,
    reserve: { collateralFactor: 8000 },
    token: { symbol: "vBTC", name: "vBTC", decimals: 8, address: "0xvBTC" },
  },
  borrowableReserves: [
    {
      reserveId: 2n,
      reserve: { collateralFactor: 0 },
      token: {
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        address: "0xUSDC" as Address,
      },
    },
  ],
  allBorrowReserves: [
    {
      reserveId: 2n,
      reserve: { collateralFactor: 0 },
      token: {
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        address: "0xUSDC" as Address,
      },
    },
  ],
}));

vi.mock("../../../../context", () => ({
  useAaveConfig: () => mockUseAaveConfig(),
}));

// Mock useAaveUserPosition
const mockUseAaveUserPosition = vi.fn<(addr?: string) => unknown>(() => ({
  position: null,
  collateralValueUsd: 15000,
  debtValueUsd: 0,
  healthFactor: null,
  healthFactorStatus: "healthy",
  isPositionDataStale: false,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
}));

// Mock useVaultSplitParams
const mockUseVaultSplitParams = vi.fn<(addr?: string) => unknown>(() => ({
  params: { THF: 1.1, CF: 0.75, LB: 1.05 },
  isLoading: false,
  error: null,
  refetch: vi.fn(),
}));

vi.mock("../../../../hooks", () => ({
  useAaveUserPosition: (addr?: string) => mockUseAaveUserPosition(addr),
  useVaultSplitParams: (addr?: string) => mockUseVaultSplitParams(addr),
}));

// Import after mocks
import { useAaveReserveDetail } from "../useAaveReserveDetail";

describe("useAaveReserveDetail", () => {
  let queryClient: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();

    // Reset network to signet (default for tests)
    mockGetBTCNetwork.mockReturnValue("signet");

    // Reset to default mock values
    mockUsePrices.mockReturnValue({
      prices: {},
      metadata: {},
      isLoading: false,
      error: null,
      hasStalePrices: false,
      hasPriceFetchError: false,
    });
    mockUseVaultSplitParams.mockReturnValue({
      params: { THF: 1.1, CF: 0.75, LB: 1.05 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseAaveUserPosition.mockReturnValue({
      position: null,
      collateralValueUsd: 15000,
      debtValueUsd: 0,
      healthFactor: null,
      healthFactorStatus: "healthy",
      isPositionDataStale: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  // --- Token price from Chainlink (#131 / #1391) ---

  it("returns Chainlink price when available", () => {
    mockUsePrices.mockReturnValue({
      prices: { USDC: 0.9998 },
      metadata: {},
      isLoading: false,
      error: null,
      hasStalePrices: false,
      hasPriceFetchError: false,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.tokenPriceUsd).toBe(0.9998);
  });

  it("falls back to $1 for known stablecoin on testnet when Chainlink feed is absent", async () => {
    // getBTCNetwork returns "signet" by default in our mock
    mockUsePrices.mockReturnValue({
      prices: {},
      metadata: {},
      isLoading: false,
      error: null,
      hasStalePrices: false,
      hasPriceFetchError: false,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.tokenPriceUsd).toBe(1.0);
  });

  it("returns null for stablecoin on mainnet when Chainlink price is missing", () => {
    mockGetBTCNetwork.mockReturnValue("mainnet");

    mockUsePrices.mockReturnValue({
      prices: {},
      metadata: {},
      isLoading: false,
      error: null,
      hasStalePrices: false,
      hasPriceFetchError: false,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.tokenPriceUsd).toBeNull();
  });

  it("returns null when Chainlink price is stale on mainnet", () => {
    mockGetBTCNetwork.mockReturnValue("mainnet");

    mockUsePrices.mockReturnValue({
      prices: { USDC: 0.9998 },
      metadata: {
        USDC: { isStale: true, ageSeconds: 7200, fetchFailed: false },
      },
      isLoading: false,
      error: null,
      hasStalePrices: true,
      hasPriceFetchError: false,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.tokenPriceUsd).toBeNull();
  });

  it("returns null when Chainlink fetch failed on mainnet", () => {
    mockGetBTCNetwork.mockReturnValue("mainnet");

    mockUsePrices.mockReturnValue({
      prices: { USDC: 1.0 },
      metadata: {
        USDC: {
          isStale: false,
          ageSeconds: 0,
          fetchFailed: true,
          error: "RPC timeout",
        },
      },
      isLoading: false,
      error: null,
      hasStalePrices: false,
      hasPriceFetchError: true,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.tokenPriceUsd).toBeNull();
  });

  it("falls back to $1 for stale stablecoin price on testnet", () => {
    // getBTCNetwork returns signet (1) by default
    mockUsePrices.mockReturnValue({
      prices: { USDC: 0.9998 },
      metadata: {
        USDC: { isStale: true, ageSeconds: 7200, fetchFailed: false },
      },
      isLoading: false,
      error: null,
      hasStalePrices: true,
      hasPriceFetchError: false,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.tokenPriceUsd).toBe(1.0);
  });

  it("returns null for unknown token without Chainlink price", () => {
    mockUseAaveConfig.mockReturnValue({
      config: {
        coreSpokeAddress: "0xSpokeAddress",
        btcVaultCoreVbtcReserveId: 1n,
      },
      vbtcReserve: {
        reserveId: 1n,
        reserve: { collateralFactor: 8000 },
        token: {
          symbol: "vBTC",
          name: "vBTC",
          decimals: 8,
          address: "0xvBTC",
        },
      },
      borrowableReserves: [
        {
          reserveId: 3n,
          reserve: { collateralFactor: 0 },
          token: {
            symbol: "WBTC",
            name: "Wrapped Bitcoin",
            decimals: 8,
            address: "0xWBTC" as Address,
          },
        },
      ],
      allBorrowReserves: [
        {
          reserveId: 3n,
          reserve: { collateralFactor: 0 },
          token: {
            symbol: "WBTC",
            name: "Wrapped Bitcoin",
            decimals: 8,
            address: "0xWBTC" as Address,
          },
        },
      ],
    });
    mockUsePrices.mockReturnValue({
      prices: {},
      metadata: {},
      isLoading: false,
      error: null,
      hasStalePrices: false,
      hasPriceFetchError: false,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "WBTC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.tokenPriceUsd).toBeNull();
  });

  it("returns null tokenPriceUsd when no reserve is selected", () => {
    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: undefined, address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.tokenPriceUsd).toBeNull();
    expect(result.current.selectedReserve).toBeNull();
  });

  // --- Position-specific collateral factor (#147) ---

  it("uses CF from useVaultSplitParams for liquidationThresholdBps", () => {
    mockUseVaultSplitParams.mockReturnValue({
      params: { THF: 1.1, CF: 0.75, LB: 1.05 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.liquidationThresholdBps).toBe(7500);
  });

  it("returns 0 for liquidationThresholdBps when splitParams is null", () => {
    mockUseVaultSplitParams.mockReturnValue({
      params: null,
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.liquidationThresholdBps).toBe(0);
  });

  it("handles CF values that could produce floating-point imprecision", () => {
    // 0.8333 * 10000 = 8333.0 in most cases, but test the rounding
    mockUseVaultSplitParams.mockReturnValue({
      params: { THF: 1.1, CF: 0.8333, LB: 1.05 },
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.liquidationThresholdBps).toBe(8333);
  });

  // --- Loading state ---

  it("includes prices loading in isLoading", () => {
    mockUsePrices.mockReturnValue({
      prices: {},
      metadata: {},
      isLoading: true,
      error: null,
      hasStalePrices: false,
      hasPriceFetchError: false,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(true);
  });

  it("includes splitParams loading in isLoading", () => {
    mockUseVaultSplitParams.mockReturnValue({
      params: null,
      isLoading: true,
      error: null,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(true);
  });

  it("is not loading when all sources have resolved", () => {
    mockUsePrices.mockReturnValue({
      prices: { USDC: 1.0 },
      metadata: {},
      isLoading: false,
      error: null,
      hasStalePrices: false,
      hasPriceFetchError: false,
    });
    mockUseVaultSplitParams.mockReturnValue({
      params: { THF: 1.1, CF: 0.75, LB: 1.05 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseAaveUserPosition.mockReturnValue({
      position: null,
      collateralValueUsd: 15000,
      debtValueUsd: 0,
      healthFactor: null,
      healthFactorStatus: "healthy",
      isPositionDataStale: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(false);
  });

  // --- Integration: passes address to useVaultSplitParams ---

  it("passes user address to useVaultSplitParams for position-specific CF lookup", () => {
    renderHook(
      () =>
        useAaveReserveDetail({ reserveId: "USDC", address: "0xUserAddress" }),
      { wrapper },
    );

    expect(mockUseVaultSplitParams).toHaveBeenCalledWith("0xUserAddress");
  });

  // --- Error propagation ---

  it("propagates useAaveUserPosition error as positionError (audit #311 hard-block)", () => {
    const debtError = new Error("Debt reserve fetch failure");
    mockUseAaveUserPosition.mockReturnValue({
      position: null,
      collateralValueUsd: 0,
      debtValueUsd: 0,
      healthFactor: null,
      healthFactorStatus: "healthy",
      isPositionDataStale: false,
      isLoading: false,
      error: debtError,
      refetch: vi.fn(),
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.positionError).toBe(debtError);
    expect(result.current.ancillaryError).toBeNull();
  });

  it("propagates pricesError as ancillaryError (soft-warn, not a hard block)", () => {
    const pricesError = new Error("Chainlink RPC failure");
    mockUsePrices.mockReturnValue({
      prices: {},
      metadata: {},
      isLoading: false,
      error: pricesError,
      hasStalePrices: false,
      hasPriceFetchError: true,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.ancillaryError).toBe(pricesError);
    expect(result.current.positionError).toBeNull();
  });

  it("propagates splitParams error as ancillaryError (soft-warn, not a hard block)", () => {
    const splitError = new Error("Contract RPC failure");
    mockUseVaultSplitParams.mockReturnValue({
      params: null,
      isLoading: false,
      error: splitError,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.ancillaryError).toBe(splitError);
    expect(result.current.positionError).toBeNull();
  });

  it("returns null for both errors when no hooks have errors", () => {
    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.positionError).toBeNull();
    expect(result.current.ancillaryError).toBeNull();
  });

  // --- Staleness passthrough (#132) ---

  it("passes through isPositionDataStale from useAaveUserPosition", () => {
    mockUseAaveUserPosition.mockReturnValue({
      position: null,
      collateralValueUsd: 15000,
      debtValueUsd: 0,
      healthFactor: null,
      healthFactorStatus: "healthy",
      isPositionDataStale: true,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.isPositionDataStale).toBe(true);
  });

  it("exposes refetchPosition from useAaveUserPosition", () => {
    const mockRefetch = vi.fn();
    mockUseAaveUserPosition.mockReturnValue({
      position: null,
      collateralValueUsd: 15000,
      debtValueUsd: 0,
      healthFactor: null,
      healthFactorStatus: "healthy",
      isPositionDataStale: false,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "USDC", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.refetchPosition).toBe(mockRefetch);
  });
});
