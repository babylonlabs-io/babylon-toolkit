import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  ENV: {
    BTC_VAULTS_MANAGER: "0x1234567890123456789012345678901234567890",
    AAVE_CONTROLLER: "0x1234567890123456789012345678901234567890",
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
const mockGetCollateralFactor = vi.fn();
const mockGetLiquidationBonus = vi.fn();

vi.mock("../../clients", () => ({
  AaveSpoke: {
    getTargetHealthFactor: (...args: unknown[]) =>
      mockGetTargetHealthFactor(...args),
    getCollateralFactor: (...args: unknown[]) =>
      mockGetCollateralFactor(...args),
    getLiquidationBonus: (...args: unknown[]) =>
      mockGetLiquidationBonus(...args),
  },
}));

vi.mock("../../utils", () => ({
  wadToNumber: (wad: bigint) => Number(wad) / 1e18,
}));

vi.mock("../../context", () => ({
  useAaveConfig: vi.fn(() => ({
    config: {
      btcVaultCoreSpokeAddress: "0xSpokeAddress",
    },
  })),
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

    // Default mock values: THF=1.10 (WAD), CF=7500 (BPS), LB=1.05 (WAD)
    mockGetTargetHealthFactor.mockResolvedValue(1_100_000_000_000_000_000n);
    mockGetCollateralFactor.mockResolvedValue(7500n);
    mockGetLiquidationBonus.mockResolvedValue(1_050_000_000_000_000_000n);
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
