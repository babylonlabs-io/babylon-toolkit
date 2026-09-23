import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  ENV: {
    BTC_VAULT_REGISTRY: "0x1234567890123456789012345678901234567890",
    AAVE_ADAPTER: "0x1234567890123456789012345678901234567890",
    GRAPHQL_ENDPOINT: "https://test.example.com/graphql",
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
}));

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: vi.fn(() => ({})),
  },
}));

const mockGetLiquidationBonusConfig = vi.fn();
const mockGetDynamicReserveConfig = vi.fn();
const mockGetReserve = vi.fn();

vi.mock("../../clients", () => ({
  AaveSpoke: {
    getLiquidationBonusConfig: (...args: unknown[]) =>
      mockGetLiquidationBonusConfig(...args),
    getDynamicReserveConfig: (...args: unknown[]) =>
      mockGetDynamicReserveConfig(...args),
    getReserve: (...args: unknown[]) => mockGetReserve(...args),
  },
}));

vi.mock("../../context", () => ({
  useAaveConfig: vi.fn(() => ({
    config: {
      coreSpokeAddress: "0xSpokeAddress",
      vaultBtcReserveId: 1n,
    },
    vbtcReserve: null,
  })),
}));

// Stub useAaveUserPosition — useVaultSplitParams reads the position's stored
// dynamicConfigKey from it to correctly match the contract's liquidation path.
// Tests override this mock via mockUseAaveUserPosition.mockReturnValue(...).
type MockUseAaveUserPositionResult = {
  position: { liveData: { dynamicConfigKey: number } } | null;
  isLoading: boolean;
};
const mockUseAaveUserPosition = vi.fn<
  (connectedAddress?: string) => MockUseAaveUserPositionResult
>(() => ({
  position: null,
  isLoading: false,
}));

vi.mock("../useAaveUserPosition", () => ({
  useAaveUserPosition: (connectedAddress?: string) =>
    mockUseAaveUserPosition(connectedAddress),
}));

import { useVaultSplitParams } from "../useVaultSplitParams";

describe("useVaultSplitParams", () => {
  let queryClient: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  beforeEach(() => {
    queryClient = new QueryClient({
      // retryDelay: 0 makes the hook's `retry: CONFIG_RETRY_COUNT` overrides
      // resolve quickly in the rejected-mock test below.
      defaultOptions: { queries: { retry: false, retryDelay: 0 } },
    });
    vi.clearAllMocks();

    // Default mock values: bonus curve with max bonus at HF 0.90 and 90% of
    // it at HF 1.0; CF=7500 (BPS), max LB=10555 (BPS). viem decodes these
    // small uints as numbers.
    mockGetLiquidationBonusConfig.mockResolvedValue({
      healthFactorForMaxBonus: 900_000_000_000_000_000n,
      liquidationBonusFactor: 9000n,
    });
    mockGetDynamicReserveConfig.mockResolvedValue({
      collateralFactor: 7500,
      maxLiquidationBonus: 10555,
      liquidationFee: 100,
    });
    mockGetReserve.mockResolvedValue({
      dynamicConfigKey: 0,
    });
    // Default: no user position (e.g. disconnected or no position yet)
    mockUseAaveUserPosition.mockReturnValue({
      position: null,
      isLoading: false,
    });
  });

  it("uses the split constants for THF and expected HF, and the Spoke's bonus curve at HF 0.99 for LB", async () => {
    const { result } = renderHook(() => useVaultSplitParams(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // LB: 10499 + (10555 − 10499) × 0.01 / 0.10 = 10504 BPS
    expect(result.current.params).toEqual({
      THF: 1.08,
      expectedHF: 0.99,
      CF: 0.75,
      LB: 1.0504,
      lbUnavailableReason: null,
      maxLB: 1.0555,
    });
    expect(result.current.error).toBeNull();
  });

  it("reports a null bonus instead of guessing when the Spoke's bonus curve is out of range", async () => {
    // healthFactorForMaxBonus must be below 1e18; the contract would never
    // accept this configuration.
    mockGetLiquidationBonusConfig.mockResolvedValue({
      healthFactorForMaxBonus: 1_000_000_000_000_000_000n,
      liquidationBonusFactor: 9000n,
    });

    const { result } = renderHook(() => useVaultSplitParams(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.params?.LB).toBeNull();
    expect(result.current.params?.lbUnavailableReason).toBeTruthy();
    // The query itself succeeds: the collateral factor still has to reach the
    // borrow and repay pre-sign checks, which re-read it through this query.
    expect(result.current.error).toBeNull();
    expect(result.current.params?.CF).toBe(0.75);
  });

  it("passes reserveId and dynamicConfigKey to getDynamicReserveConfig", async () => {
    const { result } = renderHook(() => useVaultSplitParams(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetDynamicReserveConfig).toHaveBeenCalledWith(
      "0xSpokeAddress",
      1n,
      0,
    );
  });

  it("reads the reserve's current dynamicConfigKey from the contract when user has no position", async () => {
    const { result } = renderHook(() => useVaultSplitParams(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetReserve).toHaveBeenCalledWith("0xSpokeAddress", 1n);
    expect(mockGetDynamicReserveConfig).toHaveBeenCalledWith(
      "0xSpokeAddress",
      1n,
      0,
    );
  });

  it("prefers the position's stored dynamicConfigKey over the reserve's current key", async () => {
    // User has an existing position — liquidation math uses position's key,
    // which differs from the reserve's rotated key.
    mockUseAaveUserPosition.mockReturnValue({
      position: {
        liveData: {
          dynamicConfigKey: 5,
        },
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useVaultSplitParams("0xUserAddress"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Must use the position's key (5), NOT the reserve's current key (0)
    expect(mockGetDynamicReserveConfig).toHaveBeenCalledWith(
      "0xSpokeAddress",
      1n,
      5,
    );
    // No need to read the reserve from the contract — we already have a key
    expect(mockGetReserve).not.toHaveBeenCalled();
  });

  it("defers fetching while the position query is still loading for a connected user", () => {
    mockUseAaveUserPosition.mockReturnValue({
      position: null,
      isLoading: true,
    });

    const { result } = renderHook(() => useVaultSplitParams("0xUserAddress"), {
      wrapper,
    });

    // Loading state must bubble up so consumers don't compute with stale key
    expect(result.current.isLoading).toBe(true);
    expect(result.current.params).toBeNull();
    expect(mockGetDynamicReserveConfig).not.toHaveBeenCalled();
  });

  it("uses the dynamicConfigKey returned by getReserve for users without a position", async () => {
    const { useAaveConfig } = vi.mocked(await import("../../context"));
    useAaveConfig.mockReturnValue({
      config: {
        adapterAddress: "0x1",
        vaultBtcAddress: "0x2",
        btcVaultRegistryAddress: "0x3",
        coreSpokeAddress: "0xSpokeAddress",
        vaultBtcReserveId: 1n,
      },
      vbtcReserve: null,
      borrowableReserves: [],
      allBorrowReserves: [],
      hubSpokeConfigs: {},
    });

    mockGetReserve.mockResolvedValue({
      dynamicConfigKey: 2,
    });

    const { result } = renderHook(() => useVaultSplitParams(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetReserve).toHaveBeenCalledWith("0xSpokeAddress", 1n);
    expect(mockGetDynamicReserveConfig).toHaveBeenCalledWith(
      "0xSpokeAddress",
      1n,
      2,
    );
    expect(result.current.params).toEqual({
      THF: 1.08,
      expectedHF: 0.99,
      CF: 0.75,
      LB: 1.0504,
      lbUnavailableReason: null,
      maxLB: 1.0555,
    });
  });

  it("returns loading state while fetching", () => {
    mockGetLiquidationBonusConfig.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useVaultSplitParams(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.params).toBeNull();
  });

  it("returns null params when spoke address is not available", async () => {
    const { useAaveConfig } = vi.mocked(await import("../../context"));
    useAaveConfig.mockReturnValue({
      config: null,
      vbtcReserve: null,
      borrowableReserves: [],
      allBorrowReserves: [],
      hubSpokeConfigs: {},
    });

    const { result } = renderHook(() => useVaultSplitParams(), { wrapper });

    // Query is disabled when no spoke address — stays in initial state
    expect(result.current.params).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("exposes refetch that re-runs the contract calls and returns fresh values", async () => {
    // Earlier tests in this file null out the spoke address; restore it so
    // the query is enabled here.
    const { useAaveConfig } = vi.mocked(await import("../../context"));
    useAaveConfig.mockReturnValue({
      config: {
        adapterAddress: "0x1",
        vaultBtcAddress: "0x2",
        btcVaultRegistryAddress: "0x3",
        coreSpokeAddress: "0xSpokeAddress",
        vaultBtcReserveId: 1n,
      },
      vbtcReserve: null,
      borrowableReserves: [],
      allBorrowReserves: [],
      hubSpokeConfigs: {},
    });

    // beforeEach default has CF=0.75 (7500 BPS). Initial load picks that up.
    const { result } = renderHook(() => useVaultSplitParams(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.params?.CF).toBe(0.75);
    expect(mockGetDynamicReserveConfig).toHaveBeenCalledTimes(1);

    // Simulate a governance-driven CF reduction for the same
    // dynamicConfigKey. The query key never changes, so without an
    // explicit refetch React Query would keep the cached 0.75 — the bug
    // auditor finding #260 calls out.
    mockGetDynamicReserveConfig.mockResolvedValue({
      collateralFactor: 7000,
      maxLiquidationBonus: 10555,
      liquidationFee: 100,
    });

    const refreshed = await result.current.refetch();

    expect(mockGetDynamicReserveConfig).toHaveBeenCalledTimes(2);
    expect(refreshed?.CF).toBe(0.7);
    await waitFor(() => {
      expect(result.current.params?.CF).toBe(0.7);
    });
  });

  it("refetch surfaces underlying errors instead of returning stale data", async () => {
    const { useAaveConfig } = vi.mocked(await import("../../context"));
    useAaveConfig.mockReturnValue({
      config: {
        adapterAddress: "0x1",
        vaultBtcAddress: "0x2",
        btcVaultRegistryAddress: "0x3",
        coreSpokeAddress: "0xSpokeAddress",
        vaultBtcReserveId: 1n,
      },
      vbtcReserve: null,
      borrowableReserves: [],
      allBorrowReserves: [],
      hubSpokeConfigs: {},
    });

    const { result } = renderHook(() => useVaultSplitParams(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockGetDynamicReserveConfig.mockRejectedValue(new Error("RPC failure"));

    await expect(result.current.refetch()).rejects.toThrow("RPC failure");
  });

  it("refetch({ retry: 0 }) does not retry on RPC failure (fast pre-sign feedback)", async () => {
    const { useAaveConfig } = vi.mocked(await import("../../context"));
    useAaveConfig.mockReturnValue({
      config: {
        adapterAddress: "0x1",
        vaultBtcAddress: "0x2",
        btcVaultRegistryAddress: "0x3",
        coreSpokeAddress: "0xSpokeAddress",
        vaultBtcReserveId: 1n,
      },
      vbtcReserve: null,
      borrowableReserves: [],
      allBorrowReserves: [],
      hubSpokeConfigs: {},
    });

    const { result } = renderHook(() => useVaultSplitParams(), { wrapper });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Default for refetch (no opts) inherits CONFIG_RETRY_COUNT = 3 → 4 calls.
    // Pre-sign callers pass retry: 0 → exactly 1 call before surfacing the error.
    mockGetDynamicReserveConfig.mockReset();
    mockGetDynamicReserveConfig.mockRejectedValue(new Error("RPC failure"));

    await expect(result.current.refetch({ retry: 0 })).rejects.toThrow(
      "RPC failure",
    );
    expect(mockGetDynamicReserveConfig).toHaveBeenCalledTimes(1);
  });
});
