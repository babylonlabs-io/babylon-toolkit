/**
 * Whether a vault's application registration is Active on chain.
 *
 * Gates the activate-and-redeem escape hatch, which the registry rejects with
 * `ApplicationNotActive` unless the application is Active. See
 * `clients/eth-contract/application-status/query`.
 */

import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";

import { isVaultApplicationActive } from "@/clients/eth-contract/application-status/query";

const APPLICATION_STATUS_QUERY_KEY = "vaultApplicationStatus";
// A registration flipping to Paused is a governance event, not a per-block
// one, and this only gates one confirm screen — so poll on the same cadence
// as the pause state rather than per render.
const APPLICATION_STATUS_REFETCH_INTERVAL_MS = 20_000;
const APPLICATION_STATUS_STALE_TIME_MS = 10_000;

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
 */
export function useVaultApplicationActive(
  vaultId: Hex | undefined,
): boolean | undefined {
  const { data } = useQuery({
    queryKey: [APPLICATION_STATUS_QUERY_KEY, vaultId],
    queryFn: () => isVaultApplicationActive(vaultId as Hex),
    enabled: vaultId !== undefined,
    refetchInterval: APPLICATION_STATUS_REFETCH_INTERVAL_MS,
    staleTime: APPLICATION_STATUS_STALE_TIME_MS,
    networkMode: "always",
    // A revert or RPC failure must not retry-storm the confirm screen; one
    // retry, then the caller's fail-open path takes over.
    retry: 1,
  });
  return data;
}
