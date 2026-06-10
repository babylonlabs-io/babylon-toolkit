/**
 * Batched per-reserve borrow APR read from the Aave v4 Hub. Returns
 * `Record<reserveId.toString(), number | null>` with APRs as percentages
 * (e.g. 3.7 for 3.7%).
 *
 * Wallet-less: reads go through the app's public RPC client, so this works
 * on disconnected surfaces (e.g. the landing card).
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getAssetDrawnRatesSafe } from "../clients/aaveHub";
import type { AaveReserveConfig } from "../services/fetchConfig";

/** RAY fixed-point scale used by Aave for rates (1e27 = 100%). */
const RAY = 1e27;
const PERCENT_SCALE = 100;
const QUERY_KEY = "aaveBorrowAprs";
const ONE_MINUTE_MS = 60 * 1000;

export interface UseAaveBorrowAprsResult {
  /** Borrow APR percent per reserve ID; null when that reserve's read failed. */
  aprPercentByReserveId: Record<string, number | null>;
  isLoading: boolean;
  error: Error | null;
}

export function useAaveBorrowAprs({
  reserves,
}: {
  reserves: AaveReserveConfig[];
}): UseAaveBorrowAprsResult {
  // Sort + stringify for a stable cache key regardless of input order.
  const reserveIdsKey = useMemo(
    () =>
      reserves
        .map((r) => r.reserveId.toString())
        .sort()
        .join(","),
    [reserves],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, reserveIdsKey],
    queryFn: async () => {
      const results = await getAssetDrawnRatesSafe(
        reserves.map((r) => ({
          hub: r.reserve.hub,
          assetId: r.reserve.assetId,
        })),
      );
      const out: Record<string, number | null> = {};
      results.forEach((result, i) => {
        out[reserves[i].reserveId.toString()] =
          result.rateRay == null
            ? null
            : (Number(result.rateRay) / RAY) * PERCENT_SCALE;
      });
      return out;
    },
    enabled: reserves.length > 0,
    staleTime: ONE_MINUTE_MS,
    refetchInterval: ONE_MINUTE_MS,
  });

  // Same stale-data guard as useAaveReservesPrices: clear `data` on error.
  return {
    aprPercentByReserveId: error ? {} : (data ?? {}),
    isLoading: reserves.length > 0 && isLoading,
    error: (error as Error | null) ?? null,
  };
}
