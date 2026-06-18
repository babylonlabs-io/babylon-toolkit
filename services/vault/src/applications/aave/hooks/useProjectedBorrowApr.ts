/**
 * Current and projected (post-borrow) borrow APR for the selected reserve.
 *
 * The borrow APR is a function of the Hub asset's utilization, which a new
 * borrow raises. Both endpoints are read from the asset's on-chain interest-rate
 * strategy (see `getProjectedBorrowAprPercentsSafe`) so the `current -> projected`
 * delta is exact rather than a frontend re-derivation of the rate curve.
 *
 * The entered amount is debounced before it reaches the query key: the slider
 * fires continuously while dragging, and each distinct amount is its own
 * on-chain read. `keepPreviousData` holds the last figures during a refetch so
 * the row doesn't blank between keystrokes.
 *
 * Wallet-less: reads go through the app's public RPC client.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { parseUnits } from "viem";

import { getProjectedBorrowAprPercentsSafe } from "../clients/aaveHub";
import { SAFE_TOFIXED_PRECISION } from "../constants";
import type { AaveReserveConfig } from "../services/fetchConfig";

const QUERY_KEY = "aaveProjectedBorrowApr";
const ONE_MINUTE_MS = 60 * 1000;
/** Settle time before an edited amount triggers a fresh on-chain read. */
const AMOUNT_DEBOUNCE_MS = 300;

export interface UseProjectedBorrowAprResult {
  /** Current borrow APR percent, or null while loading/unavailable. */
  currentPercent: number | null;
  /** Post-borrow borrow APR percent, or null while loading/unavailable. */
  projectedPercent: number | null;
  isLoading: boolean;
  error: Error | null;
}

export function useProjectedBorrowApr({
  reserve,
  borrowAmount,
}: {
  reserve: AaveReserveConfig;
  borrowAmount: number;
}): UseProjectedBorrowAprResult {
  // Debounce the entered amount so dragging the slider doesn't issue an
  // on-chain read per tick. The current rate (amount 0) needs no settling, so
  // seed with the live value and only delay subsequent edits.
  const [debouncedAmount, setDebouncedAmount] = useState(borrowAmount);
  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedAmount(borrowAmount),
      AMOUNT_DEBOUNCE_MS,
    );
    return () => clearTimeout(timeout);
  }, [borrowAmount]);

  const { decimals } = reserve.token;
  // Clamp toFixed precision to SAFE_TOFIXED_PRECISION to avoid IEEE 754
  // artifacts, mirroring the borrow-tx conversion; the projection only needs
  // display-grade precision regardless.
  const borrowAmountRaw = parseUnits(
    Math.max(debouncedAmount, 0).toFixed(
      Math.min(decimals, SAFE_TOFIXED_PRECISION),
    ),
    decimals,
  );

  const { hub, assetId } = reserve.reserve;
  const hubKey = hub.toLowerCase();

  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, hubKey, assetId, borrowAmountRaw.toString()],
    queryFn: () =>
      getProjectedBorrowAprPercentsSafe({ hub, assetId, borrowAmountRaw }),
    // Hold the last figures across amount edits (the slider settles between
    // reads) so the row doesn't blank, but NOT across a reserve switch — the
    // new reserve must not briefly display the previous reserve's APR.
    placeholderData: (previous, previousQuery) => {
      const previousKey = previousQuery?.queryKey;
      return previousKey?.[1] === hubKey && previousKey?.[2] === assetId
        ? previous
        : undefined;
    },
    staleTime: ONE_MINUTE_MS,
    refetchInterval: ONE_MINUTE_MS,
  });

  // Surface the SDK-style error from a non-throwing read while still falling
  // back to nulls, so callers render the empty placeholder.
  return {
    currentPercent: data?.currentPercent ?? null,
    projectedPercent: data?.projectedPercent ?? null,
    isLoading,
    error: (error as Error | null) ?? data?.error ?? null,
  };
}
