/**
 * useActionableReclaims — the settled vaults that still have a reclaim left to
 * act on, and the row action for each candidate.
 *
 * A settled vault's reserve is reclaimable, being swept, or claimable but
 * blocked — all three keep the row — or there is nothing left, which takes the
 * row off the deposits page; `/activity` keeps the record. The decision needs a
 * contract read and two Bitcoin lookups, so both are batched here, once for
 * every candidate, and the resulting action is handed to the row rather than
 * recomputed per row.
 *
 * Both the row list and the page-emptiness predicate read this hook, so the
 * rendered rows and the count the page is judged empty by cannot drift. The two
 * call sites share the underlying queries through the query cache.
 *
 * `inFlightVaultIds` only ever moves a candidate between outcomes that all keep
 * the row — an available or blocked reclaim becomes `reclaiming` — so a caller
 * with no modal state of its own, the emptiness predicate, passes the empty set
 * and still sees every row the section renders.
 *
 * `isResolving` is what keeps that predicate honest: eligibility fails closed,
 * so a candidate with no verdict yet is indistinguishable from one with nothing
 * left to reclaim, and a page judged on the second would flash its empty state.
 */

import { useMemo } from "react";

import {
  useReclaimRowAction,
  type ReclaimRowAction,
} from "@/hooks/deposit/useReclaimRowAction";
import { useReclaimStatus } from "@/hooks/useReclaimStatus";
import { useReclaimVaultChainData } from "@/hooks/useReclaimVaultChainData";
import type { VaultActivity } from "@/types/activity";

export const NO_RECLAIMS_IN_FLIGHT: ReadonlySet<string> = new Set<string>();

export function useActionableReclaims(
  reclaimableCandidates: VaultActivity[],
  inFlightVaultIds: ReadonlySet<string>,
): {
  candidates: VaultActivity[];
  actions: Map<string, ReclaimRowAction>;
  isResolving: boolean;
} {
  // Contract reads for the settled candidates: the authoritative PegIn txid and
  // the live on-chain status. Cached long — a settled vault's row is immutable.
  const candidateVaultIds = useMemo(
    () => reclaimableCandidates.map((a) => a.id),
    [reclaimableCandidates],
  );
  const reclaimChainData = useReclaimVaultChainData(candidateVaultIds);

  // Bitcoin poll, one batch for the whole section. Only vaults whose contract
  // read landed are probed — without it the gate fails closed anyway.
  const reclaimOutpoints = useMemo(
    () =>
      reclaimableCandidates
        .map((activity) => {
          const chain = reclaimChainData.get(activity.id.toLowerCase());
          return chain
            ? { depositId: activity.id as string, peginTxid: chain.peginTxid }
            : null;
        })
        .filter(
          (o): o is { depositId: string; peginTxid: string } => o !== null,
        ),
    [reclaimableCandidates, reclaimChainData],
  );
  const { statusByDepositId } = useReclaimStatus(reclaimOutpoints);

  const resolveReclaimRowAction = useReclaimRowAction();
  const actions = useMemo(
    () =>
      new Map(
        reclaimableCandidates.map((activity) => {
          const id = activity.id.toLowerCase();
          return [
            id,
            resolveReclaimRowAction({
              status: statusByDepositId.get(id),
              onChainStatus: reclaimChainData.get(id)?.onChainStatus,
              depositorBtcPubkey: activity.depositorBtcPubkey,
              isReclaimInFlight: inFlightVaultIds.has(id),
            }),
          ];
        }),
      ),
    [
      reclaimableCandidates,
      statusByDepositId,
      reclaimChainData,
      inFlightVaultIds,
      resolveReclaimRowAction,
    ],
  );

  const candidates = useMemo(
    () =>
      reclaimableCandidates.filter((activity) => {
        const action = actions.get(activity.id.toLowerCase());
        return (
          action &&
          (action.available ||
            action.needsWallet ||
            action.reclaiming ||
            action.blockedTooltip !== null)
        );
      }),
    [reclaimableCandidates, actions],
  );

  // The reserve poll only runs for vaults whose contract read landed, so a
  // missing status covers both stages of the chain.
  const isResolving = reclaimableCandidates.some(
    (activity) => !statusByDepositId.has(activity.id.toLowerCase()),
  );

  return { candidates, actions, isResolving };
}
