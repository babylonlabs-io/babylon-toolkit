/**
 * Daily BTC/USD candles behind the liquidation Timeline.
 *
 * The series is the oracle's own history — the prices that actually moved
 * health factors — resolved through the vaultBTC reserve's price feed. The
 * feeds publish roughly hourly, so a refetch faster than that would return the
 * same rows; a stale window of half an hour keeps the newest candle current
 * without polling ahead of the data.
 *
 * `candles: null` means "nothing to draw" (loading, no config, or a failed
 * fetch). The chart renders its frame without marks in that case, so a missing
 * series degrades to an empty price panel rather than an error state.
 */

import type { Candle } from "@babylonlabs-io/core-ui";
import { skipToken, useQuery } from "@tanstack/react-query";

import { useAaveConfig } from "../context/AaveConfigContext";
import { fetchPriceCandles } from "../services/fetchPriceCandles";

const QUERY_KEY = "btcPriceCandles";
const CANDLE_STALE_TIME_MS = 30 * 60 * 1000;

/** Daily buckets, matching the date axis in the design. */
const CANDLE_INTERVAL = "day_1" as const;

/**
 * Days of history requested. Wider than the visible window so the Timeline's
 * pan has somewhere to go.
 */
const CANDLE_LIMIT = 180;

export interface UseBtcPriceCandlesResult {
  candles: Candle[] | null;
  isLoading: boolean;
  error: Error | null;
}

export function useBtcPriceCandles(): UseBtcPriceCandlesResult {
  const { config } = useAaveConfig();
  const reserveId = config?.vaultBtcReserveId ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, reserveId?.toString() ?? null, CANDLE_INTERVAL],
    // skipToken (rather than `enabled`) both disables the query while there is
    // no reserve and narrows `reserveId` to bigint for the fetch.
    queryFn:
      reserveId === null
        ? skipToken
        : ({ signal }) =>
            fetchPriceCandles({
              reserveId,
              interval: CANDLE_INTERVAL,
              limit: CANDLE_LIMIT,
              signal,
            }),
    staleTime: CANDLE_STALE_TIME_MS,
    refetchInterval: CANDLE_STALE_TIME_MS,
  });

  return {
    // Same stale-data guard as the other indexer series: clear `data` on error
    // so a failed background refetch never leaves last-good candles on screen
    // beside an error.
    candles: error ? null : (data ?? null),
    isLoading,
    error: (error as Error | null) ?? null,
  };
}
