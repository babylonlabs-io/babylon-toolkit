/**
 * On-chain interest-rate-model curve for the selected reserve — the data
 * source for the C2 borrow-rate chart. Wraps `getInterestRateModelCurveSafe`
 * (three sequential multicalls: Hub totals, strategy shape, per-sample rates)
 * in a query so the card can render loading/error states like its sibling
 * Aave hooks.
 *
 * Cached for an hour, deliberately: the curve is a pure function of the
 * strategy's governance-set parameters and the sampled utilization ratios
 * (see the client module doc), so it only changes when governance updates the
 * strategy. Polling it per minute multiplied every viewer's RPC load ~60×
 * for a shape that never moved. The live-utilization marker is NOT part of
 * this read — the card takes it from the page's 60s reserve reads, so its
 * freshness is unaffected by this cache. `gcTime` matches `staleTime`:
 * with the default 5-minute gc a route remount would refetch anyway.
 *
 * `staleTime` alone never re-invokes the queryFn once mounted, and this app
 * sets `refetchOnWindowFocus: false` globally, so `refetchInterval` is what
 * actually re-runs the read hourly while the card stays mounted. An errored
 * query instead re-runs every 60s so a transient RPC failure self-heals
 * in-session instead of waiting out the full hour — one attempt per cycle
 * (`retry: false`), since that 60s cadence is already the retry mechanism;
 * the global retry-with-backoff policy would only multiply RPC load on a
 * persistently failing market.
 *
 * There is no "empty but successful" curve: a configured strategy always
 * yields the full sample set, so `curve === null` is the one empty state,
 * covering both the loading window and a failed read (Safe-result errors are
 * rethrown in the queryFn so a failure is never cached as hour-fresh data).
 * On error the hook withholds retained data rather than the last-good curve —
 * same guard as `useAaveReserveLiquidity`.
 *
 * Wallet-less: reads go through the app's public RPC client.
 */

import { skipToken, useQuery } from "@tanstack/react-query";

import {
  getInterestRateModelCurveSafe,
  type IrmCurvePoint,
} from "../clients/aaveIrm";
import type { AaveReserveConfig } from "../services/fetchConfig";

const QUERY_KEY = "aaveIrmCurve";
const CURVE_CACHE_MS = 60 * 60 * 1000;
const ERROR_REFETCH_INTERVAL_MS = 60_000;

export interface UseInterestRateModelCurveResult {
  curve: IrmCurvePoint[] | null;
  kinkUtilizationPercent: number | null;
  maxAprPercent: number | null;
  isLoading: boolean;
  error: Error | null;
}

export function useInterestRateModelCurve({
  reserve,
}: {
  reserve: AaveReserveConfig | null;
}): UseInterestRateModelCurveResult {
  const hubKey = reserve === null ? null : reserve.reserve.hub.toLowerCase();
  const assetId = reserve === null ? null : reserve.reserve.assetId;

  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, hubKey, assetId],
    queryFn:
      reserve === null
        ? skipToken
        : async () => {
            const result = await getInterestRateModelCurveSafe({
              hub: reserve.reserve.hub,
              assetId: reserve.reserve.assetId,
            });
            // A Safe-result failure must surface as a query ERROR, not be
            // cached as hour-fresh data: stored as success, one transient RPC
            // failure would pin "chart unavailable" for the full cache
            // window. As an error it is refetched every 60s (below) and
            // refetched on the next mount regardless of `staleTime`.
            if (result.error !== null) throw result.error;
            return result;
          },
    staleTime: CURVE_CACHE_MS,
    gcTime: CURVE_CACHE_MS,
    refetchInterval: (query) =>
      query.state.status === "error"
        ? ERROR_REFETCH_INTERVAL_MS
        : CURVE_CACHE_MS,
    // The 60s error refetchInterval above IS the retry mechanism for this
    // query; the global 3-retry-with-backoff policy would only quadruple RPC
    // attempts per cycle on a persistently failing market.
    retry: false,
  });

  return {
    curve: error ? null : (data?.curve ?? null),
    kinkUtilizationPercent: error
      ? null
      : (data?.kinkUtilizationPercent ?? null),
    maxAprPercent: error ? null : (data?.maxAprPercent ?? null),
    isLoading: reserve !== null && isLoading,
    error: (error as Error | null) ?? null,
  };
}
