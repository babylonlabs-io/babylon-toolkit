/**
 * The vault provider's BTC claim txid for each redeemed vault the Inactive
 * Vaults section lists, once the provider reports the claim broadcast.
 *
 * Reuses the Activity tab's resolver. A vault the provider has not claimed
 * yet resolves to no entry, and a provider failure is dropped there, so the
 * query itself never errors: the refetch interval is what discovers a later
 * broadcast and recovers from a failed read. It runs while any listed vault
 * has no link and stops once every one has. The cost is one batch RPC per
 * vault provider per interval, on a public method the SDK chunks at the
 * server's batch limit.
 *
 * The links live in ONE cache entry, keyed by vault id and independent of
 * the list currently shown: each read asks only about the listed vaults
 * without a link and merges its answer in. A link, once resolved, is
 * therefore kept across polls, list changes and remounts, and a read that
 * fails for one provider cannot take it off a row that already showed it.
 * The claim txid is fixed at peg-in, so a kept link can never go stale.
 *
 * The provider reports `ClaimBroadcast` when it hands the claim to its wallet
 * daemon, which submits on its own tick, so the link can 404 for a short
 * while — the same window the Activity tab's claim link has.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import { POLLING_INTERVAL_MS } from "@/config/polling";
import {
  resolveRedeemClaimTxids,
  type RedeemVaultLookup,
} from "@/services/activity/claimTxResolver";
import type { VaultActivity } from "@/types/activity";

export const REDEEM_CLAIM_TXIDS_QUERY_KEY = "redeemClaimTxids";

const QUERY_KEY = [REDEEM_CLAIM_TXIDS_QUERY_KEY] as const;

const NO_CLAIM_TXIDS: ReadonlyMap<string, string> = new Map();

function hasEveryLink(
  links: ReadonlyMap<string, string> | undefined,
  vaultIds: readonly string[],
): boolean {
  return links !== undefined && vaultIds.every((id) => links.has(id));
}

/** Never part of a vault id (a `0x` hex string), so the joined key is unambiguous. */
const VAULT_IDS_KEY_SEPARATOR = ",";

/** Claim txid by vault id, for the vaults whose provider has broadcast one. */
export function useRedeemClaimTxids(
  activities: VaultActivity[],
): ReadonlyMap<string, string> {
  // Only vaults carrying both fields the resolver matches on; the rest can
  // never resolve and would only keep the poll running.
  const lookup = useMemo(() => {
    const map = new Map<string, RedeemVaultLookup>();
    for (const activity of activities) {
      const vaultProvider = activity.providers[0]?.id;
      if (!activity.peginTxHash || !vaultProvider) continue;
      map.set(activity.id, {
        peginTxHash: activity.peginTxHash,
        vaultProvider,
      });
    }
    return map;
  }, [activities]);
  // Keyed on membership, not on the list's identity: a list rebuilt with the
  // same vaults must not re-arm the arrival read below.
  const vaultIdsKey = useMemo(
    () => Array.from(lookup.keys()).sort().join(VAULT_IDS_KEY_SEPARATOR),
    [lookup],
  );
  const vaultIds = useMemo(
    () =>
      vaultIdsKey === "" ? [] : vaultIdsKey.split(VAULT_IDS_KEY_SEPARATOR),
    [vaultIdsKey],
  );

  // The list a read serves is the one shown when it runs, not the one shown
  // when the query was created: the cache entry is shared by every list.
  const requestRef = useRef({ vaultIds, lookup });
  useEffect(() => {
    requestRef.current = { vaultIds, lookup };
  }, [vaultIds, lookup]);

  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { vaultIds: listed, lookup: listedLookup } = requestRef.current;
      const known =
        queryClient.getQueryData<ReadonlyMap<string, string>>(QUERY_KEY) ??
        NO_CLAIM_TXIDS;
      const unresolved = listed.filter((id) => !known.has(id));
      if (unresolved.length === 0) return known;
      const fresh = await resolveRedeemClaimTxids(
        unresolved.map((vaultId) => ({ vaultId })),
        listedLookup,
      );
      return new Map([...known, ...fresh]);
    },
    enabled: vaultIds.length > 0,
    refetchInterval: (query) =>
      hasEveryLink(query.state.data, requestRef.current.vaultIds)
        ? false
        : POLLING_INTERVAL_MS,
    refetchOnWindowFocus: false,
  });

  // A vault joining the list after the first read is read on arrival rather
  // than on the next interval tick. Not while a read is already running —
  // the query's own first read, or its refetch on a stale remount, covers
  // the list it finds — and not before an entry exists, for the same reason.
  // A vault arriving during a read waits for the next tick.
  useEffect(() => {
    const state =
      queryClient.getQueryState<ReadonlyMap<string, string>>(QUERY_KEY);
    if (state?.data === undefined || state.fetchStatus === "fetching") return;
    if (hasEveryLink(state.data, vaultIds)) return;
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [vaultIds, queryClient]);

  return data ?? NO_CLAIM_TXIDS;
}
