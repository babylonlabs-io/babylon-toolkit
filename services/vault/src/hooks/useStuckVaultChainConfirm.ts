// Authoritative confirmation that a suspected-stuck vault is REALLY still
// unactivated on chain.
//
// The stuck state (VERIFIED + HTLC swept by the pegin tx) is derived from the
// INDEXER's contract status plus a BTC-side probe. Both can be right while the
// conclusion is wrong: activation succeeds on chain, the indexer has not caught
// up, and the vault still reads VERIFIED. The BTC evidence is then entirely
// consistent with a healthy, activated deposit.
//
// That mattered because the only thing standing between a lagging indexer and a
// false "Activation incomplete" was a per-device `localStorage` marker. On a
// second device, or after a cleared profile, the marker is absent: the deposit
// renders as stuck, `useSigningRequiredNotifications` fires a push saying the
// vault could not be activated, and clicking it opens a BTC signing popup -
// the secret is derived before any on-chain status read. A fresh VERIFIED check
// downstream stops real harm, but the user has already been alarmed and asked
// for a signature they did not need to give.
//
// So the stuck state now requires a POSITIVE on-chain confirmation, in the same
// shape as `useActivationDeadlineGate`: the indexer supplies cheap Tier-1
// suspects, and only a chain read that still reports VERIFIED promotes one to
// genuinely stuck.

import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients/eth";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type Hex, zeroAddress } from "viem";

import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";

const STUCK_VAULT_CONFIRM_QUERY_KEY = "stuckVaultChainConfirm";
// The stuck state is terminal-ish and rare; it does not need a fast cadence.
// Matches the activation-deadline gate so the two chain reads batch together.
const POLL_INTERVAL_MS = 60 * 1000;
// Just under the poll interval so refocus/remount doesn't double-fetch.
const STALE_TIME_MS = 55 * 1000;

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Lowercased ids of suspected-stuck vaults the chain confirms are STILL
 * `VERIFIED` — i.e. genuinely unactivated.
 *
 * Fails OPEN in every uncertain case: an absent id means "not confirmed stuck",
 * so an RPC failure, an unregistered vault, or a vault the chain already reports
 * ACTIVE all leave the deposit rendering normally. That direction is deliberate.
 * Failing the other way produces exactly the defect this exists to remove — a
 * false alarm plus a signing prompt on a healthy deposit. The cost of failing
 * open is that a genuinely stuck depositor waits one poll interval for the
 * escape hatch to appear, which is recoverable; the cost of failing closed is
 * not.
 */
export function useStuckVaultChainConfirm(
  suspectIds: readonly Hex[],
): ReadonlySet<string> {
  // Joined so an unchanged suspect set keeps a stable query key across renders.
  const suspectKey = useMemo(
    () => [...suspectIds].sort().join(","),
    [suspectIds],
  );

  const query = useQuery({
    queryKey: [STUCK_VAULT_CONFIRM_QUERY_KEY, suspectKey] as const,
    enabled: suspectKey.length > 0,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    // No placeholderData: when the suspect set changes the key, the gate must
    // fail open until the chain reconfirms rather than carry a confirmation
    // computed for a different set.
    queryFn: async (): Promise<Set<string>> => {
      const reader = getVaultRegistryReader();
      const ids = suspectKey.split(",") as Hex[];
      // Per-vault reads coalesce into one Multicall3 round-trip (client batch).
      const infos = await Promise.all(
        ids.map(async (id) => {
          try {
            return { id, info: await reader.getVaultBasicInfo(id) };
          } catch {
            // Not on chain yet / transient RPC error → don't confirm.
            return null;
          }
        }),
      );

      const confirmed = new Set<string>();
      for (const entry of infos) {
        if (!entry) continue;
        const { id, info } = entry;
        // Unregistered / zero record → nothing to conclude.
        if (info.depositor === zeroAddress) continue;
        // The whole point: only a vault the CHAIN still reports VERIFIED is
        // stuck. ACTIVE means activation landed and the indexer is behind.
        if (info.status !== OnChainBtcVaultStatus.VERIFIED) continue;
        confirmed.add(id.toLowerCase());
      }
      return confirmed;
    },
  });

  // Intersect with the live suspect set so a confirmation can never outlive the
  // suspicion that produced it (React Query retains data per key).
  const confirmed = query.data;
  return useMemo(() => {
    if (!confirmed || confirmed.size === 0 || suspectIds.length === 0) {
      return EMPTY_SET;
    }
    const current = new Set(suspectIds.map((id) => id.toLowerCase()));
    const gated = new Set<string>();
    for (const id of confirmed) {
      if (current.has(id)) gated.add(id);
    }
    return gated;
  }, [confirmed, suspectIds]);
}
