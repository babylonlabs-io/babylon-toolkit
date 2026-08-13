/**
 * Interest-rate-model curve for the selected reserve — the data source for
 * the C2 borrow-rate chart. Reads the vault indexer's IRM endpoint, which
 * samples the on-chain strategy server-side and Redis-caches the result, so
 * the app just wraps the fetch in a query for the card's loading/error
 * states like its sibling Aave hooks — no on-chain reads happen here.
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
 * query instead re-runs every 60s so a transient failure self-heals
 * in-session instead of waiting out the full hour — one attempt per cycle
 * (`retry: false`), since that 60s cadence is already the retry mechanism;
 * the global retry-with-backoff policy would only multiply request load on a
 * persistently failing market.
 *
 * There is no "empty but successful" curve: the endpoint's contract is that a
 * 200 always carries a complete curve (every degraded state is a non-200), so
 * `curve === null` is the one empty state, covering both the loading window
 * and a failed read.
 *
 * The read needs only the indexer — no wallet, no RPC client.
 */

import { skipToken, useQuery } from "@tanstack/react-query";

import {
  fetchIrmCurve,
  type IrmCurvePoint,
} from "@/clients/indexer/aaveIrmClient";

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
    queryKey: [
      QUERY_KEY,
      reserve === null ? null : reserve.reserveId.toString(),
      hubKey,
      assetId,
    ],
    queryFn:
      reserve === null
        ? skipToken
        : ({ signal }) =>
            fetchIrmCurve({ reserveId: reserve.reserveId, signal }),
    staleTime: CURVE_CACHE_MS,
    gcTime: CURVE_CACHE_MS,
    refetchInterval: (query) =>
      query.state.status === "error"
        ? ERROR_REFETCH_INTERVAL_MS
        : CURVE_CACHE_MS,
    // The 60s error refetchInterval above IS the retry mechanism for this
    // query; the global 3-retry-with-backoff policy would only quadruple
    // request attempts per cycle on a persistently failing market.
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
