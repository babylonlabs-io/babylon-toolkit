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
  // Stable cache key regardless of input order. Includes the Hub asset
  // (`hub`/`assetId`) each rate is read from, not just the reserve ID, so a
  // config refresh that repoints a reserve at a different Hub asset busts the
  // cache instead of serving rates fetched for the old asset.
  const reserveAssetsKey = useMemo(
    () =>
      reserves
        .map(
          (r) =>
            `${r.reserveId.toString()}:${r.reserve.hub.toLowerCase()}:${r.reserve.assetId}`,
        )
        .sort()
        .join(","),
    [reserves],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, reserveAssetsKey],
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
