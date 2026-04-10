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

vi.mock("@babylonlabs-io/config", () => ({
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

const mockGetTargetHealthFactor = vi.fn();
const mockGetDynamicReserveConfig = vi.fn();
const mockGetReserve = vi.fn();

vi.mock("../../clients", () => ({
  AaveSpoke: {
    getTargetHealthFactor: (...args: unknown[]) =>
      mockGetTargetHealthFactor(...args),
    getDynamicReserveConfig: (...args: unknown[]) =>
      mockGetDynamicReserveConfig(...args),
    getReserve: (...args: unknown[]) => mockGetReserve(...args),
  },
}));

vi.mock("../../utils", () => ({
  wadToNumber: (wad: bigint) => Number(wad) / 1e18,
}));

vi.mock("../../context", () => ({
  useAaveConfig: vi.fn(() => ({
    config: {
      btcVaultCoreSpokeAddress: "0xSpokeAddress",
      btcVaultCoreVbtcReserveId: 1n,
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
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();

    // Default mock values: THF=1.10 (WAD), CF=7500 (BPS), LB=10500 (BPS)
    mockGetTargetHealthFactor.mockResolvedValue(1_100_000_000_000_000_000n);
    mockGetDynamicReserveConfig.mockResolvedValue({
      collateralFactor: 7500n,
      maxLiquidationBonus: 10500n,
      liquidationFee: 100n,
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

  it("returns converted THF, CF, LB values", async () => {
    const { result } = renderHook(() => useVaultSplitParams(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.params).toEqual({
      THF: 1.1,
      CF: 0.75,
      LB: 1.05,
    });
    expect(result.current.error).toBeNull();
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
        btcVaultCoreSpokeAddress: "0xSpokeAddress",
        btcVaultCoreVbtcReserveId: 1n,
      },
      vbtcReserve: null,
      borrowableReserves: [],
      isLoading: false,
      error: null,
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
      THF: 1.1,
      CF: 0.75,
      LB: 1.05,
    });
  });

  it("returns loading state while fetching", () => {
    mockGetTargetHealthFactor.mockReturnValue(new Promise(() => {}));

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
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useVaultSplitParams(), { wrapper });

    // Query is disabled when no spoke address — stays in initial state
    expect(result.current.params).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
