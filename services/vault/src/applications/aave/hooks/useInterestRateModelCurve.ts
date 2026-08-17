/**
 * Interest-rate-model curve for the selected reserve — the data source for
 * the C2 borrow-rate chart. Reads the vault indexer's IRM endpoint, which
 * samples the on-chain strategy server-side and Redis-caches the result, so
 * the app just wraps the fetch in a query for the card's loading/error
 * states like its sibling Aave hooks — no on-chain reads happen here.
 *
 * Failures ride in the query DATA, never as a thrown query error. A thrown
 * query error takes the global `QueryCache.onError` → Sentry `captureException`
 * path (see `src/config/queryClient.ts`) once per refetch — for an errored
 * IRM read that's once every 60s for as long as a broken market's tab stays
 * open, which is exactly the alert-storm the 451 fix in that file was written
 * to prevent. The queryFn instead always resolves, returning either the fresh
 * curve or the retained last-good curve plus a non-null `error` field; the
 * hook's `error` return is read straight off that data.
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
 * `staleTime` and `refetchInterval` are both functional, keyed off whether
 * the cached data carries an error: a clean read is hour-fresh and refetches
 * hourly; an errored read is immediately stale and refetches every 60s, so a
 * transient failure self-heals in-session instead of waiting out the full
 * hour or being treated as hour-fresh. `retry: false` stays — that 60s
 * refetch cadence IS the retry mechanism; the global retry-with-backoff
 * policy would only multiply request load on a persistently failing market.
 * The only throws left out of the queryFn are a cancelled fetch (rethrown so
 * React Query discards it, never cached as data) and a genuine bug, and
 * neither should be billed by that policy either.
 *
 * On a failed refetch, the last-good curve and kink/max figures are RETAINED
 * — deliberately different from `useAaveReserveLiquidity`'s null-on-error
 * guard. That hook's retained figure is a stale *live* number, so serving it
 * as current would mislead; this curve is hour-stable by construction, so the
 * last-good shape is still correct and the retry can heal silently without
 * blanking a chart the user was already looking at.
 *
 * Accepted drift window: after a governance parameter update, the stats bar's
 * Borrow APR moves within 60s while this curve and its kink callout can lag
 * up to an hour on the same screen. That's the one user-visible cost of the
 * cache, accepted in review.
 *
 * There is no "empty but successful" curve: the endpoint's contract is that a
 * 200 always carries a complete curve (every degraded state is a non-200), so
 * `curve === null` is the one empty state, covering both the loading window
 * and a read that has never yet succeeded.
 *
 * The read needs only the indexer — no wallet, no RPC client.
 */

import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";

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

interface CurveQueryData {
  curve: IrmCurvePoint[] | null;
  kinkUtilizationPercent: number | null;
  maxAprPercent: number | null;
  error: Error | null;
}

export function useInterestRateModelCurve({
  reserve,
}: {
  reserve: AaveReserveConfig | null;
}): UseInterestRateModelCurveResult {
  const queryClient = useQueryClient();
  const hubKey = reserve === null ? null : reserve.reserve.hub.toLowerCase();
  const assetId = reserve === null ? null : reserve.reserve.assetId;

  const queryKey = [
    QUERY_KEY,
    reserve === null ? null : reserve.reserveId.toString(),
    hubKey,
    assetId,
  ];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn:
      reserve === null
        ? skipToken
        : async ({ signal }): Promise<CurveQueryData> => {
            try {
              const result = await fetchIrmCurve({
                reserveId: reserve.reserveId,
                signal,
              });
              return { ...result, error: null };
            } catch (err) {
              // A cancelled fetch is React Query discarding this attempt, not
              // a failed read — rethrow it rather than caching error-shaped
              // data for a request nothing will ever consume.
              if (signal.aborted) {
                throw err;
              }
              const prev = queryClient.getQueryData<CurveQueryData>(queryKey);
              return {
                curve: prev?.curve ?? null,
                kinkUtilizationPercent: prev?.kinkUtilizationPercent ?? null,
                maxAprPercent: prev?.maxAprPercent ?? null,
                error: err instanceof Error ? err : new Error(String(err)),
              };
            }
          },
    staleTime: (query) => (query.state.data?.error ? 0 : CURVE_CACHE_MS),
    gcTime: CURVE_CACHE_MS,
    refetchInterval: (query) =>
      query.state.data?.error ? ERROR_REFETCH_INTERVAL_MS : CURVE_CACHE_MS,
    // The 60s error refetchInterval above IS the retry mechanism for this
    // query; the global 3-retry-with-backoff policy would only quadruple
    // request attempts per cycle on a persistently failing market.
    retry: false,
  });

  return {
    curve: data?.curve ?? null,
    kinkUtilizationPercent: data?.kinkUtilizationPercent ?? null,
    maxAprPercent: data?.maxAprPercent ?? null,
    isLoading: reserve !== null && isLoading,
    error: data?.error ?? null,
  };
}
