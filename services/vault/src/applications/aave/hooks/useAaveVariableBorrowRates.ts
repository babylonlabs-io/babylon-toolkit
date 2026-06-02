/** Batched per-reserve variable borrow APR for the borrowable reserves. */

import { rayRateToAprPercent } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getReservesDrawnRatesSafe } from "../clients/aaveHub";
import { useAaveConfig } from "../context";

const QUERY_KEY = "aaveVariableBorrowRates";
const ONE_MINUTE_MS = 60 * 1000;

export interface UseAaveVariableBorrowRatesResult {
  /** Annual borrow APR (percent) keyed by uppercased token symbol, e.g. `{ USDT: 3.7 }`. */
  aprBySymbol: Record<string, number | null>;
  isLoading: boolean;
  error: Error | null;
}

export function useAaveVariableBorrowRates(): UseAaveVariableBorrowRatesResult {
  const { borrowableReserves } = useAaveConfig();

  const reserves = useMemo(
    () =>
      borrowableReserves.map((r) => ({
        reserveId: r.reserveId,
        hub: r.reserve.hub,
        assetId: BigInt(r.reserve.assetId),
        symbol: r.token.symbol.toUpperCase(),
      })),
    [borrowableReserves],
  );

  // Sort + stringify for a stable cache key regardless of input order.
  const reserveKey = useMemo(
    () =>
      reserves
        .map((r) => r.reserveId.toString())
        .sort()
        .join(","),
    [reserves],
  );

  const enabled = reserves.length > 0;
  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, reserveKey],
    queryFn: async () => {
      const results = await getReservesDrawnRatesSafe(
        reserves.map(({ reserveId, hub, assetId }) => ({
          reserveId,
          hub,
          assetId,
        })),
      );
      const rateRayByReserveId = new Map(
        results.map((r) => [r.reserveId.toString(), r.rateRay]),
      );
      const out: Record<string, number | null> = {};
      for (const r of reserves) {
        const rateRay = rateRayByReserveId.get(r.reserveId.toString());
        out[r.symbol] = rateRay == null ? null : rayRateToAprPercent(rateRay);
      }
      return out;
    },
    enabled,
    staleTime: ONE_MINUTE_MS,
    refetchInterval: ONE_MINUTE_MS,
  });

  return {
    aprBySymbol: error ? {} : (data ?? {}),
    isLoading: enabled && isLoading,
    error: (error as Error | null) ?? null,
  };
}
