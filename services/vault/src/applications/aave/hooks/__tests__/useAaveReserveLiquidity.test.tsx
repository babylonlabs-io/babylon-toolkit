import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../clients/aaveHub", () => ({
  getAssetLiquiditiesSafe: vi.fn(),
}));

import { getAssetLiquiditiesSafe } from "../../clients/aaveHub";
import type { AaveReserveConfig } from "../../services/fetchConfig";
import { useAaveReserveLiquidity } from "../useAaveReserveLiquidity";

const HUB = "0x0000000000000000000000000000000000000003" as const;

function makeReserve(reserveId: bigint, assetId: number): AaveReserveConfig {
  return {
    reserveId,
    reserve: {
      underlying: "0x0000000000000000000000000000000000000010",
      hub: HUB,
      assetId,
      decimals: 6,
      dynamicConfigKey: 0,
      paused: false,
      frozen: false,
      borrowable: true,
      collateralRisk: 0,
      collateralFactor: 8000,
    },
    token: {
      address: "0x0000000000000000000000000000000000000010",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
    },
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAaveReserveLiquidity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts base units to token units and derives bps utilization", async () => {
    // 6-decimal token: 75 liquidity, 25 drawn, 2 premium, 5 swept.
    // supplied = 75 + 25 + 5 = 105; utilization = 25 / 105 = 23.80%.
    vi.mocked(getAssetLiquiditiesSafe).mockResolvedValueOnce([
      {
        hub: HUB,
        assetId: 0,
        availableLiquidityRaw: 75_000_000n,
        drawnRaw: 25_000_000n,
        premiumRaw: 2_000_000n,
        sweptRaw: 5_000_000n,
        error: null,
      },
    ]);

    const { result } = renderHook(
      () => useAaveReserveLiquidity({ reserves: [makeReserve(1n, 0)] }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.liquidityByReserveId["1"]).not.toBeUndefined(),
    );
    expect(result.current.liquidityByReserveId["1"]).toEqual({
      availableLiquidity: 75,
      totalBorrowed: 27,
      suppliedLiquidity: 105,
      utilizationBps: 2380,
    });
  });

  // The definition the Hub feeds its rate strategy, and the one the vault
  // indexer records per snapshot. Drifting from it makes the displayed
  // utilization disagree with the projected post-borrow rate and the borrow-APR
  // chart, for the same reserve at the same moment.
  it("excludes accrued premium from utilization and counts swept as supplied", async () => {
    vi.mocked(getAssetLiquiditiesSafe).mockResolvedValueOnce([
      {
        hub: HUB,
        assetId: 0,
        availableLiquidityRaw: 50_000_000n,
        drawnRaw: 50_000_000n,
        // Large enough that folding either into the ratio would be obvious:
        // premium in the numerator gives 6000bps, dropping swept gives 5000bps.
        premiumRaw: 20_000_000n,
        sweptRaw: 25_000_000n,
        error: null,
      },
    ]);

    const { result } = renderHook(
      () => useAaveReserveLiquidity({ reserves: [makeReserve(1n, 0)] }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.liquidityByReserveId["1"]).not.toBeUndefined(),
    );
    // 50 drawn / (50 + 50 + 25) supplied = 40%.
    expect(result.current.liquidityByReserveId["1"]?.utilizationBps).toBe(4000);
    expect(result.current.liquidityByReserveId["1"]?.suppliedLiquidity).toBe(
      125,
    );
  });

  it("reports null utilization when the reserve has no supplied liquidity", async () => {
    vi.mocked(getAssetLiquiditiesSafe).mockResolvedValueOnce([
      {
        hub: HUB,
        assetId: 0,
        availableLiquidityRaw: 0n,
        drawnRaw: 0n,
        premiumRaw: 0n,
        sweptRaw: 0n,
        error: null,
      },
    ]);

    const { result } = renderHook(
      () => useAaveReserveLiquidity({ reserves: [makeReserve(1n, 0)] }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.liquidityByReserveId["1"]).not.toBeUndefined(),
    );
    expect(result.current.liquidityByReserveId["1"]).toEqual({
      availableLiquidity: 0,
      totalBorrowed: 0,
      suppliedLiquidity: 0,
      utilizationBps: null,
    });
  });

  it("nulls a reserve whose read failed", async () => {
    vi.mocked(getAssetLiquiditiesSafe).mockResolvedValueOnce([
      {
        hub: HUB,
        assetId: 0,
        availableLiquidityRaw: null,
        drawnRaw: null,
        premiumRaw: null,
        sweptRaw: null,
        error: new Error("reverted"),
      },
    ]);

    const { result } = renderHook(
      () => useAaveReserveLiquidity({ reserves: [makeReserve(1n, 0)] }),
      { wrapper },
    );

    await waitFor(() =>
      expect(Object.keys(result.current.liquidityByReserveId)).toHaveLength(1),
    );
    expect(result.current.liquidityByReserveId["1"]).toBeNull();
  });

  it("is disabled when reserves is empty", () => {
    const { result } = renderHook(
      () => useAaveReserveLiquidity({ reserves: [] }),
      { wrapper },
    );
    expect(result.current.liquidityByReserveId).toEqual({});
    expect(result.current.isLoading).toBe(false);
    expect(getAssetLiquiditiesSafe).not.toHaveBeenCalled();
  });

  it("clears stale liquidity after a refetch fails", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(getAssetLiquiditiesSafe)
      .mockResolvedValueOnce([
        {
          hub: HUB,
          assetId: 0,
          availableLiquidityRaw: 75_000_000n,
          drawnRaw: 25_000_000n,
          premiumRaw: 2_000_000n,
          sweptRaw: 5_000_000n,
          error: null,
        },
      ])
      .mockRejectedValueOnce(new Error("RPC failure"));

    const wrapperWithClient = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useAaveReserveLiquidity({ reserves: [makeReserve(1n, 0)] }),
      { wrapper: wrapperWithClient },
    );

    await waitFor(() =>
      expect(result.current.liquidityByReserveId["1"]).toEqual({
        availableLiquidity: 75,
        totalBorrowed: 27,
        suppliedLiquidity: 105,
        utilizationBps: 2380,
      }),
    );

    await client.refetchQueries({ queryKey: ["aaveReserveLiquidity"] });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.liquidityByReserveId).toEqual({});
  });
});
