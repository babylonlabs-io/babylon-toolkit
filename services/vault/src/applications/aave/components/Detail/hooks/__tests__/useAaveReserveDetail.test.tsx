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
  getCurrencyIconWithFallback: vi.fn(
    (icon: string | undefined) => icon ?? "fallback-icon",
  ),
}));

// Mock useAaveConfig
/** Reserve 2 = USDC. `token.*` is indexer-supplied; the hook must not read it. */
const usdcReserve = {
  reserveId: 2n,
  reserve: { collateralFactor: 0, underlying: "0xUSDC" as Address },
  token: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    address: "0xUSDC" as Address,
  },
};

function defaultAaveConfig() {
  return {
    config: {
      coreSpokeAddress: "0xSpokeAddress",
      vaultBtcReserveId: 1n,
    },
    vbtcReserve: {
      reserveId: 1n,
      reserve: { collateralFactor: 8000 },
      token: { symbol: "vBTC", name: "vBTC", decimals: 8, address: "0xvBTC" },
    },
    borrowableReserves: [usdcReserve],
    allBorrowReserves: [usdcReserve],
  };
}

const mockUseAaveConfig = vi.fn(defaultAaveConfig);

vi.mock("../../../../context", () => ({
  useAaveConfig: () => mockUseAaveConfig(),
}));

// Mock useAaveUserPosition / useVaultSplitParams / useAaveReservePrice via
// the barrel they're imported from in useAaveReserveDetail.ts.
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

const mockUseVaultSplitParams = vi.fn<(addr?: string) => unknown>(() => ({
  params: { THF: 1.1, CF: 0.75, LB: 1.05 },
  isLoading: false,
  error: null,
  refetch: vi.fn(),
}));

const mockUseAaveReservePrice = vi.fn<
  (args: {
    spokeAddress: Address | undefined;
    reserveId: bigint | undefined;
  }) => {
    priceUsd: number | null;
    isLoading: boolean;
    error: Error | null;
  }
>(() => ({
  priceUsd: null,
  isLoading: false,
  error: null,
}));

/**
 * Identity of the selected reserve, proven on-chain. Defaults to a resolved
 * USDC identity with 6 decimals; individual tests override it to exercise the
 * spoofed-label, wrong-decimals and integrity-failure paths.
 */
const mockUseVerifiedReserveIdentity = vi.fn<
  (args: {
    reserveId: bigint | undefined;
    underlying: Address | undefined;
  }) => {
    identity: {
      address: Address;
      symbol: string;
      name: string;
      decimals: number;
      icon: string | undefined;
      source: "registry" | "onchain";
    } | null;
    isLoading: boolean;
    error: Error | null;
    isIntegrityViolation: boolean;
    retry: () => Promise<unknown>;
  }
>();

const USDC_IDENTITY = {
  address: "0xUSDC" as Address,
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  icon: "usdc-icon",
  source: "registry" as const,
};

vi.mock("../../../../hooks", () => ({
  useAaveUserPosition: (addr?: string) => mockUseAaveUserPosition(addr),
  useVaultSplitParams: (addr?: string) => mockUseVaultSplitParams(addr),
  useAaveReservePrice: (args: {
    spokeAddress: Address | undefined;
    reserveId: bigint | undefined;
  }) => mockUseAaveReservePrice(args),
  useVerifiedReserveIdentity: (args: {
    reserveId: bigint | undefined;
    underlying: Address | undefined;
  }) => mockUseVerifiedReserveIdentity(args),
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

    mockGetBTCNetwork.mockReturnValue("signet");

    mockUseAaveConfig.mockReturnValue(defaultAaveConfig());
    mockUseVerifiedReserveIdentity.mockReturnValue({
      identity: USDC_IDENTITY,
      isLoading: false,
      error: null,
      isIntegrityViolation: false,
      retry: vi.fn(),
    });
    mockUseAaveReservePrice.mockReturnValue({
      priceUsd: null,
      isLoading: false,
      error: null,
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

  // --- Token price from Aave on-chain oracle ---

  it("returns the Aave oracle price when present", () => {
    mockUseAaveReservePrice.mockReturnValue({
      priceUsd: 0.9998,
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.tokenPriceUsd).toBe(0.9998);
  });

  it("returns null when oracle returns null (no testnet fallback)", () => {
    mockUseAaveReservePrice.mockReturnValue({
      priceUsd: null,
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.tokenPriceUsd).toBeNull();
  });

  it("returns null when oracle errors (no testnet fallback)", () => {
    mockUseAaveReservePrice.mockReturnValue({
      priceUsd: null,
      isLoading: false,
      error: new Error("oracle revert"),
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.tokenPriceUsd).toBeNull();
  });

  it("returns null for a non-stablecoin reserve on testnet when oracle is unavailable", () => {
    mockUseAaveConfig.mockReturnValue({
      config: {
        coreSpokeAddress: "0xSpokeAddress",
        vaultBtcReserveId: 1n,
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
          reserve: { collateralFactor: 0, underlying: "0xWBTC" as Address },
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
          reserve: { collateralFactor: 0, underlying: "0xWBTC" as Address },
          token: {
            symbol: "WBTC",
            name: "Wrapped Bitcoin",
            decimals: 8,
            address: "0xWBTC" as Address,
          },
        },
      ],
    });
    mockUseAaveReservePrice.mockReturnValue({
      priceUsd: null,
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "3", address: "0xUser" }),
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
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
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
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.liquidationThresholdBps).toBe(0);
  });

  it("handles CF values that could produce floating-point imprecision", () => {
    mockUseVaultSplitParams.mockReturnValue({
      params: { THF: 1.1, CF: 0.8333, LB: 1.05 },
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.liquidationThresholdBps).toBe(8333);
  });

  // --- Loading state ---

  it("includes prices loading in isLoading", () => {
    mockUseAaveReservePrice.mockReturnValue({
      priceUsd: null,
      isLoading: true,
      error: null,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
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
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(true);
  });

  it("is not loading when all sources have resolved", () => {
    mockUseAaveReservePrice.mockReturnValue({
      priceUsd: 1.0,
      isLoading: false,
      error: null,
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
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(false);
  });

  // --- Integration: passes address to useVaultSplitParams ---

  it("passes user address to useVaultSplitParams for position-specific CF lookup", () => {
    renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUserAddress" }),
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
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.positionError).toBe(debtError);
    expect(result.current.ancillaryError).toBeNull();
  });

  it("propagates oracle pricesError as ancillaryError (soft-warn, not a hard block)", () => {
    const pricesError = new Error("Oracle RPC failure");
    mockUseAaveReservePrice.mockReturnValue({
      priceUsd: null,
      isLoading: false,
      error: pricesError,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
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
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.ancillaryError).toBe(splitError);
    expect(result.current.positionError).toBeNull();
  });

  it("returns null for both errors when no hooks have errors", () => {
    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
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
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
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
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.refetchPosition).toBe(mockRefetch);
  });

  // --- Reserve resolution by on-chain id, not indexer symbol ---

  it("resolves the reserve whose id matches, even when another shares its symbol", () => {
    const duplicateSymbolReserve = {
      reserveId: 9n,
      reserve: { collateralFactor: 0, underlying: "0xIMPOSTOR" as Address },
      token: {
        symbol: "USDC",
        name: "USD Coin",
        decimals: 18,
        address: "0xIMPOSTOR" as Address,
      },
    };
    mockUseAaveConfig.mockReturnValue({
      ...defaultAaveConfig(),
      // Impostor listed first, so a symbol `.find` would return it.
      borrowableReserves: [duplicateSymbolReserve, usdcReserve],
      allBorrowReserves: [duplicateSymbolReserve, usdcReserve],
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.selectedReserve?.reserveId).toBe(2n);
    expect(result.current.selectedReserve?.reserve.underlying).toBe("0xUSDC");
  });

  it("blocks when two reserves claim the same id", () => {
    const collidingReserve = {
      ...usdcReserve,
      reserve: { collateralFactor: 0, underlying: "0xIMPOSTOR" as Address },
    };
    mockUseAaveConfig.mockReturnValue({
      ...defaultAaveConfig(),
      borrowableReserves: [usdcReserve, collidingReserve],
      allBorrowReserves: [usdcReserve, collidingReserve],
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.selectedReserve).toBeNull();
  });

  it("blocks a legacy symbol link and flags it as outdated", () => {
    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "usdc", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.selectedReserve).toBeNull();
    expect(result.current.assetConfig).toBeNull();
    expect(result.current.currentDebtAmount).toBeNull();
    expect(result.current.isLegacyReserveParam).toBe(true);
  });

  it.each(["abc", "0x2", " 2 ", "-1", "2.0"])(
    "blocks the non-numeric reserve param %j",
    (param) => {
      const { result } = renderHook(
        () => useAaveReserveDetail({ reserveId: param, address: "0xUser" }),
        { wrapper },
      );

      expect(result.current.selectedReserve).toBeNull();
    },
  );

  it("does not flag a missing reserve param as an outdated link", () => {
    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: undefined, address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.isLegacyReserveParam).toBe(false);
  });

  // --- Display metadata comes from the proven identity ---

  it("labels the asset from the proven identity, not the indexer's spoofed symbol", () => {
    const spoofedReserve = {
      reserveId: 2n,
      reserve: { collateralFactor: 0, underlying: "0xWETH" as Address },
      token: {
        // Indexer claims USDC for what is really WETH.
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        address: "0xWETH" as Address,
      },
    };
    mockUseAaveConfig.mockReturnValue({
      ...defaultAaveConfig(),
      borrowableReserves: [spoofedReserve],
      allBorrowReserves: [spoofedReserve],
    });
    mockUseVerifiedReserveIdentity.mockReturnValue({
      identity: {
        address: "0xWETH" as Address,
        symbol: "WETH",
        name: "Wrapped Ether",
        decimals: 18,
        icon: "weth-icon",
        source: "registry",
      },
      isLoading: false,
      error: null,
      isIntegrityViolation: false,
      retry: vi.fn(),
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.assetConfig).toEqual({
      symbol: "WETH",
      name: "Wrapped Ether",
      icon: "weth-icon",
    });
  });

  it("verifies the reserve against its on-chain underlying, not the indexer's token address", () => {
    const divergentReserve = {
      reserveId: 2n,
      reserve: { collateralFactor: 0, underlying: "0xREAL" as Address },
      token: {
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        address: "0xDECOY" as Address,
      },
    };
    mockUseAaveConfig.mockReturnValue({
      ...defaultAaveConfig(),
      borrowableReserves: [divergentReserve],
      allBorrowReserves: [divergentReserve],
    });

    renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(mockUseVerifiedReserveIdentity).toHaveBeenCalledWith({
      reserveId: 2n,
      underlying: "0xREAL",
    });
  });

  it("formats debt with the proven decimals, not the indexer's", () => {
    const wrongDecimalsReserve = {
      ...usdcReserve,
      // Indexer claims 18 for a token that really has 6.
      token: { ...usdcReserve.token, decimals: 18 },
    };
    mockUseAaveConfig.mockReturnValue({
      ...defaultAaveConfig(),
      borrowableReserves: [wrongDecimalsReserve],
      allBorrowReserves: [wrongDecimalsReserve],
    });
    mockUseAaveUserPosition.mockReturnValue({
      position: {
        debtPositions: new Map([[2n, { totalDebt: 1_500_000n }]]),
      },
      collateralValueUsd: 15000,
      debtValueUsd: 1.5,
      healthFactor: null,
      healthFactorStatus: "healthy",
      isPositionDataStale: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    // 1_500_000 at the proven 6 decimals is 1.5, not 0.0000000000015.
    expect(result.current.currentDebtAmount).toBe(1.5);
  });

  it("reports zero debt only once the identity is proven", () => {
    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.currentDebtAmount).toBe(0);
  });

  // --- Identity failure hard-blocks the screen ---

  it("withholds the label and the debt figure while the identity is unproven", () => {
    mockUseVerifiedReserveIdentity.mockReturnValue({
      identity: null,
      isLoading: true,
      error: null,
      isIntegrityViolation: false,
      retry: vi.fn(),
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.assetConfig).toBeNull();
    expect(result.current.currentDebtAmount).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it("surfaces a proven mismatch as identityError, separate from positionError", () => {
    const mismatch = new Error("reserve resolves to a different token");
    mockUseVerifiedReserveIdentity.mockReturnValue({
      identity: null,
      isLoading: false,
      error: mismatch,
      isIntegrityViolation: true,
      retry: vi.fn(),
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.identityError).toBe(mismatch);
    expect(result.current.isIdentityCompromised).toBe(true);
    expect(result.current.positionError).toBeNull();
    expect(result.current.ancillaryError).toBeNull();
    expect(result.current.assetConfig).toBeNull();
    expect(result.current.currentDebtAmount).toBeNull();
  });

  it("marks a transient verification failure as not compromised", () => {
    mockUseVerifiedReserveIdentity.mockReturnValue({
      identity: null,
      isLoading: false,
      error: new Error("rpc connection lost"),
      isIntegrityViolation: false,
      retry: vi.fn(),
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.isIdentityCompromised).toBe(false);
  });

  it("exposes the identity retry so a transient failure can be re-run", () => {
    const retry = vi.fn();
    mockUseVerifiedReserveIdentity.mockReturnValue({
      identity: null,
      isLoading: false,
      error: new Error("rpc connection lost"),
      isIntegrityViolation: false,
      retry,
    });

    const { result } = renderHook(
      () => useAaveReserveDetail({ reserveId: "2", address: "0xUser" }),
      { wrapper },
    );

    expect(result.current.retryIdentity).toBe(retry);
  });
});
