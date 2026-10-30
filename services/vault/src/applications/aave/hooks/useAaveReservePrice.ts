/**
 * Single-reserve USD price from the Aave on-chain oracle (the source of
 * liquidation truth). Returns `priceUsd: null` on revert; do not substitute.
 *
 * A failed read rides in the query data, as in `useInterestRateModelCurve`
 * and `useAaveOracleAddress`: the queryFn always resolves, so a retry never
 * resets the query to loading, the error stays with the reserve's own cache
 * entry, and the failure is reported to error tracking once per outage. The
 * queryFn makes the app's quick retries itself before it records a fresh
 * failure, as React Query retries only a queryFn that rejects: a single failed
 * RPC call keeps the last price on screen instead of disabling borrowing.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";

import { withQueryRetryPolicy } from "@/config/queryClient";
import { logger } from "@/infrastructure";
import { normalizeError } from "@/utils/errors/normalizeError";

import { getReservesPrices } from "../clients/aaveOracle";
import { ORACLE_READ_RETRY_INTERVAL_MS } from "../constants";

import { useAaveOracleAddress } from "./useAaveOracleAddress";

/** Aave oracle base unit (Spoke.ORACLE_DECIMALS = 8). */
const ORACLE_SCALE = 1e8;
const QUERY_KEY = "aaveReservePrice";
const ONE_MINUTE_MS = 60 * 1000;

interface ReservePriceQueryData {
  /** The last price read successfully, kept through a failure; null if none. */
  priceUsd: number | null;
  /**
   * When `priceUsd` was first read (ms since epoch), or 0 if never: a poll,
   * or a recovery, that reads the same price keeps it.
   */
  changedAt: number;
  error: Error | null;
}

export interface UseAaveReservePriceResult {
  priceUsd: number | null;
  /** First read only: a failed read stays failed, not loading, while retried. */
  isLoading: boolean;
  /**
   * True while `priceUsd` is still the previously-selected reserve's last good
   * price, carried over as placeholder data so switching assets does not
   * unmount the borrow form. Only a price is carried over, never a failure:
   * switching away from a reserve with no price loads the new one as a first
   * read (`isLoading`). Consumers must not treat the price — or any value
   * derived from it (max borrow, available liquidity) — as belonging to the
   * current reserve until this clears.
   */
  isPriceStale: boolean;
  error: Error | null;
  /**
   * When the price last changed value (ms since epoch), or 0 before the first
   * success. A poll that reads the same price does not move it.
   */
  priceChangedAt: number;
}

export function useAaveReservePrice({
  spokeAddress,
  reserveId,
}: {
  spokeAddress: Address | undefined;
  reserveId: bigint | undefined;
}): UseAaveReservePriceResult {
  const {
    oracleAddress,
    isLoading: oracleLoading,
    error: oracleError,
  } = useAaveOracleAddress({ spokeAddress });

  const queryClient = useQueryClient();
  const priceEnabled = oracleAddress != null && reserveId != null;
  const queryKey = [
    QUERY_KEY,
    oracleAddress,
    reserveId == null ? null : reserveId.toString(),
  ];
  const {
    data,
    isLoading: priceLoading,
    isPlaceholderData,
  } = useQuery({
    queryKey,
    queryFn: async ({ signal }): Promise<ReservePriceQueryData> => {
      const prev = queryClient.getQueryData<ReservePriceQueryData>(queryKey);
      const read = () => getReservesPrices(oracleAddress!, [reserveId!]);
      try {
        // Once a failure is recorded, the error refetch is the retry: one
        // read, not another round of backoff on the shared RPC client.
        const [raw] = await (prev?.error
          ? read()
          : withQueryRetryPolicy(read, signal));
        const priceUsd = Number(raw) / ORACLE_SCALE;
        return {
          priceUsd,
          changedAt: prev?.priceUsd === priceUsd ? prev.changedAt : Date.now(),
          error: null,
        };
      } catch (err) {
        // A cancelled fetch is React Query discarding this attempt, not a
        // failed read.
        if (signal.aborted) throw err;
        const error = normalizeError(err);
        if (prev === undefined || prev.error === null) {
          logger.error(error, {
            tags: { query: QUERY_KEY },
            data: { reserveId: reserveId!.toString() },
          });
        }
        return {
          priceUsd: prev?.priceUsd ?? null,
          changedAt: prev?.changedAt ?? 0,
          error,
        };
      }
    },
    enabled: priceEnabled,
    staleTime: (query) => (query.state.data?.error ? 0 : ONE_MINUTE_MS),
    // After the queryFn's own quick retries give up, the error refetch is the
    // retry, sooner than the minute's poll.
    refetchInterval: (query) =>
      query.state.data?.error ? ORACLE_READ_RETRY_INTERVAL_MS : ONE_MINUTE_MS,
    // The queryFn makes the quick retries itself and never rejects.
    retry: false,
    // The client default is off, and polling pauses in a hidden tab. Without
    // this, a tab back from an hour away would price the liquidation cascade
    // from an hour-old reading for up to a minute.
    refetchOnWindowFocus: true,
    // Keep the prior reserve's price on screen while the new one loads so the
    // borrow form stays mounted on asset switch (no flash/remount). The stale
    // window is surfaced via `isPriceStale` so consumers can withhold
    // price-derived figures until the fresh value lands. Only a price is
    // carried over, never the prior reserve's failure: with no last price
    // there is no placeholder, and the new reserve loads as a first read.
    placeholderData: (previous) =>
      previous?.priceUsd != null ? { ...previous, error: null } : undefined,
  });

  // Propagate oracle-address loading/error up; price query is disabled until
  // address resolves. No price is served next to an error: the kept last
  // price only dates a recovery.
  const upstreamRequested = spokeAddress != null && reserveId != null;
  const error = oracleError ?? data?.error ?? null;
  return {
    priceUsd: error ? null : (data?.priceUsd ?? null),
    isLoading: upstreamRequested && (oracleLoading || priceLoading),
    isPriceStale: isPlaceholderData,
    error,
    priceChangedAt: data?.changedAt ?? 0,
  };
}
