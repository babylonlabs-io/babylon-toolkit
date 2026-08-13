/**
 * Whether a vault's application registration is Active on chain.
 *
 * Gates the activate-and-redeem escape hatch, which the registry rejects with
 * `ApplicationNotActive` unless the application is Active. See
 * `clients/eth-contract/application-status/query`.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Hex } from "viem";

import { isVaultApplicationActive } from "@/clients/eth-contract/application-status/query";

const APPLICATION_STATUS_QUERY_KEY = "vaultApplicationStatus";
// A registration flipping to Paused is a governance event, not a per-block
// one, and this only gates one confirm screen — so poll on the same cadence
// as the pause state rather than per render.
const APPLICATION_STATUS_REFETCH_INTERVAL_MS = 20_000;
const APPLICATION_STATUS_STALE_TIME_MS = 10_000;

/**
 * Shared config for both consumers below, so the render-time gate and the
 * click-time gate can never diverge on cache key or freshness — a click-time
 * read that missed the hook's cache would cost an extra RPC round-trip on the
 * one screen where latency is felt.
 */
function vaultApplicationActiveQueryOptions(vaultId: Hex) {
  return {
    queryKey: [APPLICATION_STATUS_QUERY_KEY, vaultId],
    queryFn: () => isVaultApplicationActive(vaultId),
    staleTime: APPLICATION_STATUS_STALE_TIME_MS,
    networkMode: "always" as const,
    // A revert or RPC failure must not retry-storm the confirm screen; one
    // retry, then the caller's fail-open path takes over.
    retry: 1,
  };
}

/**
 * `true` / `false` once the chain answers; `undefined` while loading or after
 * a failed read.
 *
 * Callers must treat `undefined` as "do not block" (fail OPEN). This is an
 * EXIT path, and the same reasoning the pause gate documents applies with
 * more force here: over-blocking strands a depositor whose peg-in was already
 * swept, and a real `ApplicationNotActive` is still caught pre-broadcast by
 * `executeWrite`'s mandatory simulation, which refuses to sign. Blocking on a
 * CONFIRMED non-Active status is the value this adds — not blocking on doubt.
 *
 * This hook suppresses the CTA at render time. It cannot gate the submit path
 * on its own: it returns whatever the cache holds at paint, which is
 * `undefined` for the whole first round-trip after the modal mounts. The
 * click-time gate is {@link useEnsureVaultApplicationActive}.
 */
export function useVaultApplicationActive(
  vaultId: Hex | undefined,
): boolean | undefined {
  const { data } = useQuery({
    ...vaultApplicationActiveQueryOptions(vaultId as Hex),
    enabled: vaultId !== undefined,
    refetchInterval: APPLICATION_STATUS_REFETCH_INTERVAL_MS,
  });
  return data;
}

/**
 * Awaited counterpart of {@link useVaultApplicationActive}, for the confirm
 * click: resolves the status before the caller derives the HTLC secret, rather
 * than reading whatever happened to be cached when the button was painted.
 *
 * Without it, a click during the first round-trip opens the BTC wallet, derives
 * the secret, and puts it in the pre-broadcast simulation's calldata — for a
 * revert the FE could have predicted.
 *
 * Same fail-open contract: `undefined` on a failed read means "do not block".
 *
 * `fetchQuery`, not `ensureQueryData`: the latter returns cached data of ANY
 * age without consulting `staleTime`. That is fine while the modal stays open
 * (the hook above polls), but the modal unmounts on close, and reopening it
 * within `gcTime` would hand a fast click an answer minutes old. `fetchQuery`
 * re-reads whenever the entry is past `staleTime` and otherwise reuses it, so
 * the answer is at most `APPLICATION_STATUS_STALE_TIME_MS` old, and a read
 * already in flight is shared rather than duplicated.
 *
 * No read makes this atomic — the user still spends seconds in a BTC wallet
 * popup before the transaction is simulated. The point is not to act on a
 * plainly stale answer.
 */
export function useEnsureVaultApplicationActive(): (
  vaultId: Hex,
) => Promise<boolean | undefined> {
  const queryClient = useQueryClient();
  return useCallback(
    async (vaultId: Hex) => {
      try {
        return await queryClient.fetchQuery(
          vaultApplicationActiveQueryOptions(vaultId),
        );
      } catch {
        return undefined;
      }
    },
    [queryClient],
  );
}
