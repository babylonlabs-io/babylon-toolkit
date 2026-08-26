/**
 * On-chain-proven identity for the reserve a loan screen is about.
 *
 * Wraps `verifyReserveIdentity` in a query so the detail screen can withhold
 * every label and every amount until the reserve's underlying token is proven
 * against the chain (audit F7). Until `identity` is non-null, nothing derived
 * from the reserve may render.
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Address } from "viem";

import { getAaveAdapterAddress } from "../config";
import {
  isIntegrityFailure,
  verifyReserveIdentity,
  type VerifiedReserveIdentity,
} from "../services/verifyReserveIdentity";

const QUERY_KEY = "aaveReserveIdentity";
/**
 * This query gates first paint, so cap the worst case near 3s (1s + 2s
 * backoff) instead of the global retry budget — a stuck RPC should surface a
 * Retry affordance, not an open-ended spinner.
 */
const TRANSIENT_RETRY_COUNT = 2;

export interface UseVerifiedReserveIdentityResult {
  /** Null until proven. Never render a label or an amount while this is null. */
  identity: VerifiedReserveIdentity | null;
  isLoading: boolean;
  /** Non-null means hard-block the screen. */
  error: Error | null;
  /**
   * True when `error` is a proven mismatch or an unlabelable token rather than
   * an RPC fault. Drives integrity copy with no retry affordance; false drives
   * neutral copy with one.
   */
  isIntegrityViolation: boolean;
  /** Re-run verification, bypassing retry backoff. Pointless for integrity failures. */
  retry: () => Promise<unknown>;
}

export function useVerifiedReserveIdentity({
  reserveId,
  underlying,
}: {
  reserveId: bigint | undefined;
  /**
   * The reserve's underlying token address. Must be `reserve.underlying`, not
   * `token.address`: those are two independent indexer fields, and the one we
   * prove is the one downstream code may then trust.
   */
  underlying: Address | undefined;
}): UseVerifiedReserveIdentityResult {
  // Read the adapter here rather than accepting it as a prop: the guard is only
  // meaningful against the env-pinned address the transaction is actually sent
  // to. Taking it from a caller would let an attacker-controlled adapter/spoke
  // pair prove a mapping the real transaction never uses.
  const adapterAddress = getAaveAdapterAddress();
  const enabled = reserveId != null && underlying != null;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      QUERY_KEY,
      adapterAddress,
      reserveId == null ? null : reserveId.toString(),
      underlying?.toLowerCase() ?? null,
    ],
    queryFn: () =>
      verifyReserveIdentity(adapterAddress, reserveId!, underlying!),
    enabled,

    // Every input is immutable: the spoke's reserveId -> underlying mapping is
    // fixed at listing, ERC20 decimals never change, and the token registry is
    // a compile-time table. Refetching buys nothing and risks flipping a
    // mounted, mid-typing borrow form into a hard block on a transient blip.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    // An errored query holds no data and is stale regardless of `staleTime`, so
    // this recovers a user who dropped connectivity without them clicking
    // anything. Successful entries stay pinned.
    refetchOnReconnect: true,

    // A proven spoof is a conclusion, not a fault — retrying only delays the
    // warning. Overrides the global retry policy for that case only.
    retry: (failureCount, err) =>
      !isIntegrityFailure(err) && failureCount < TRANSIENT_RETRY_COUNT,

    // Deliberately no `placeholderData: keepPreviousData` (unlike
    // useAaveReservePrice): carrying the previous reserve's symbol and decimals
    // across an asset switch would paint one asset's label over another's
    // numbers, which is the exact failure this hook exists to prevent.
  });

  // Mirror `refetchSplitParams`: a user-initiated retry should answer in one
  // round-trip rather than stalling through the backoff schedule.
  const retry = useCallback(() => refetch({ retry: 0 } as never), [refetch]);

  const identityError = (error as Error | null) ?? null;
  return {
    // Never show a proven-stale identity next to a fresh error.
    identity: identityError ? null : (data ?? null),
    isLoading: enabled && isLoading,
    error: identityError,
    isIntegrityViolation:
      identityError != null && isIntegrityFailure(identityError),
    retry,
  };
}
