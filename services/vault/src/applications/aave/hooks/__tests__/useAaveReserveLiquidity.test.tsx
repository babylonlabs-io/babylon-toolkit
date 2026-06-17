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
    // 6-decimal token: 75 available + 25 owed → 75 token units, 25% utilization.
    vi.mocked(getAssetLiquiditiesSafe).mockResolvedValueOnce([
      {
        hub: HUB,
        assetId: 0,
        availableLiquidityRaw: 75_000_000n,
        totalOwedRaw: 25_000_000n,
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
      utilizationBps: 2500,
    });
  });

  it("reports null utilization when the reserve has no supplied liquidity", async () => {
    vi.mocked(getAssetLiquiditiesSafe).mockResolvedValueOnce([
      {
        hub: HUB,
        assetId: 0,
        availableLiquidityRaw: 0n,
        totalOwedRaw: 0n,
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
      utilizationBps: null,
    });
  });

  it("nulls a reserve whose read failed", async () => {
    vi.mocked(getAssetLiquiditiesSafe).mockResolvedValueOnce([
      {
        hub: HUB,
        assetId: 0,
        availableLiquidityRaw: null,
        totalOwedRaw: null,
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
          totalOwedRaw: 25_000_000n,
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
        utilizationBps: 2500,
      }),
    );

    await client.refetchQueries({ queryKey: ["aaveReserveLiquidity"] });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.liquidityByReserveId).toEqual({});
  });
});
