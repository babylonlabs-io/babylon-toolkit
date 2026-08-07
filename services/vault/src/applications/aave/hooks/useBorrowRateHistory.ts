/**
 * Historical borrow APR series for a reserve, over a selectable range.
 *
 * Reads the vault indexer's stepped history endpoint (a borrow rate is a level
 * that holds until the next state change, so the series is never averaged).
 * `staleTime`/`refetchInterval` match the server's 60s Redis TTL.
 *
 * `placeholderData` keeps the previous range's series visible while a new
 * range loads, but only within the SAME reserve — switching reserves must
 * never flash the outgoing reserve's series (same guard pattern as
 * `useProjectedBorrowApr`).
 */

import { skipToken, useQuery } from "@tanstack/react-query";

import {
  fetchBorrowRateHistory,
  type BorrowRateHistoryPoint,
  type HistoryRange,
} from "@/clients/indexer/aaveHistoryClient";

const QUERY_KEY = "aaveBorrowRateHistory";
const HISTORY_STALE_TIME_MS = 60_000;
const HISTORY_REFETCH_INTERVAL_MS = 60_000;

export interface UseBorrowRateHistoryResult {
  /**
   * null while loading/failed; [] is a truly empty (young-reserve) series.
   * Withheld on error so a failed background refetch never surfaces
   * React Query's stale last-good series alongside the error.
   */
  points: BorrowRateHistoryPoint[] | null;
  isLoading: boolean;
  error: Error | null;
}

export function useBorrowRateHistory({
  reserveId,
  range,
}: {
  reserveId: bigint | null;
  range: HistoryRange;
}): UseBorrowRateHistoryResult {
  const reserveKey = reserveId?.toString() ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, reserveKey, range],
    // skipToken (rather than `enabled`) both disables the query while there is
    // no reserve and narrows `reserveId` to bigint for the fetch. Forwarding
    // React Query's `signal` aborts a superseded request on unmount or a rapid
    // range switch instead of letting it run to the 30s timeout.
    queryFn:
      reserveId === null
        ? skipToken
        : ({ signal }) => fetchBorrowRateHistory({ reserveId, range, signal }),
    staleTime: HISTORY_STALE_TIME_MS,
    refetchInterval: HISTORY_REFETCH_INTERVAL_MS,
    placeholderData: (previous, previousQuery) => {
      const previousReserveKey = previousQuery?.queryKey[1];
      return previousReserveKey === reserveKey ? previous : undefined;
    },
  });

  // Same stale-data guard as useAaveReserveLiquidity: clear `data` on error.
  return {
    points: error ? null : (data ?? null),
    isLoading,
    error: (error as Error | null) ?? null,
  };
}
