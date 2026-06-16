import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../clients/aaveHub", () => ({
  getAssetDrawnRatesSafe: vi.fn(),
}));

import { getAssetDrawnRatesSafe } from "../../clients/aaveHub";
import type { AaveReserveConfig } from "../../services/fetchConfig";
import { useAaveBorrowAprs } from "../useAaveBorrowAprs";

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
      symbol: "USDT",
      name: "Tether USD",
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

describe("useAaveBorrowAprs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts RAY rates to percent keyed by reserveId, leaving failed assets null", async () => {
    vi.mocked(getAssetDrawnRatesSafe).mockResolvedValueOnce([
      // 0.037e27 RAY = 3.7% APR
      {
        hub: HUB,
        assetId: 0,
        rateRay: 37_000_000_000_000_000_000_000_000n,
        error: null,
      },
      { hub: HUB, assetId: 1, rateRay: null, error: new Error("reverted") },
    ]);
    const { result } = renderHook(
      () =>
        useAaveBorrowAprs({
          reserves: [makeReserve(1n, 0), makeReserve(2n, 1)],
        }),
      { wrapper },
    );
    await waitFor(() =>
      expect(Object.keys(result.current.aprPercentByReserveId)).toHaveLength(2),
    );
    expect(result.current.aprPercentByReserveId["1"]).toBeCloseTo(3.7);
    expect(result.current.aprPercentByReserveId["2"]).toBeNull();
  });

  it("is disabled when reserves is empty", () => {
    const { result } = renderHook(() => useAaveBorrowAprs({ reserves: [] }), {
      wrapper,
    });
    expect(result.current.aprPercentByReserveId).toEqual({});
    expect(result.current.isLoading).toBe(false);
    expect(getAssetDrawnRatesSafe).not.toHaveBeenCalled();
  });

  it("clears stale aprPercentByReserveId after a refetch fails", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(getAssetDrawnRatesSafe)
      .mockResolvedValueOnce([
        {
          hub: HUB,
          assetId: 0,
          rateRay: 37_000_000_000_000_000_000_000_000n,
          error: null,
        },
      ])
      .mockRejectedValueOnce(new Error("RPC failure"));

    const wrapperWithClient = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useAaveBorrowAprs({ reserves: [makeReserve(1n, 0)] }),
      { wrapper: wrapperWithClient },
    );

    await waitFor(() =>
      expect(result.current.aprPercentByReserveId["1"]).toBeCloseTo(3.7),
    );

    await client.refetchQueries({ queryKey: ["aaveBorrowAprs"] });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.aprPercentByReserveId).toEqual({});
  });
});
