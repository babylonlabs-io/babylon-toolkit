// Centralized poller for the depositor-claim reserve. One batched query for
// every candidate vault, mirroring `useBtcHtlcRefundStatus` — per-row queries
// would fan out against mempool.space's rate limit.
//
// Two outpoints are probed per vault, and both matter:
//   vout 0 — the vault UTXO. Its spend is the Payout, and that is the gate.
//   vout 1 — the reserve itself, to know there is still something to sweep.
// See `models/reclaimEligibility` for why the gate is on Bitcoin rather than
// the Ethereum vault status.

import {
  getOutspend,
  getTipHeight,
  getUtxoInfo,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { PEGIN_DEPOSITOR_CLAIM_VOUT } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { getMempoolApiUrl } from "@/clients/btc/config";
import {
  PEGIN_VAULT_VOUT,
  type OutpointSpend,
} from "@/models/reclaimEligibility";
import { mapWithConcurrency } from "@/utils/concurrency";

// A settled vault changes state on a ~10-min block, so a minute of latency is
// immaterial. Matches the HTLC refund poller.
const POLL_INTERVAL_MS = 60 * 1000;
const STALE_TIME_MS = 55 * 1000;
// Each vault costs three requests, so keep the vault-level fan-out low.
const MAX_CONCURRENT_VAULTS = 2;

export const RECLAIM_STATUS_QUERY_KEY = "depositorClaimOutspend";

/** Per-vault reserve state, as observed on Bitcoin. */
export interface ReclaimStatus {
  payoutSpend: OutpointSpend;
  reserveSpend: OutpointSpend;
  /** The reserve's value, for the row's "reclaimable" figure. */
  reserveValueSats: bigint;
}

/** One candidate vault to probe. */
export interface ReclaimOutpoint {
  /** Vault id (the result map's key). */
  depositId: string;
  /** PegIn txid, derived from the contract's depositor-signed PegIn tx. */
  peginTxid: string;
}

export interface ReclaimStatusResult {
  /** Vault id (lowercased) → reserve state. Missing = not yet polled. */
  statusByDepositId: Map<string, ReclaimStatus>;
  /** Current Bitcoin tip height, for the confirmation-depth check. */
  tipHeight: number | undefined;
}

// Stable identity for the no-data render; a fresh Map per render would defeat
// every downstream memo. Same reasoning as `EMPTY_REFUNDS`.
const EMPTY_STATUSES = new Map<string, ReclaimStatus>();

interface ReclaimBatch {
  statuses: Map<string, ReclaimStatus>;
  tipHeight: number | undefined;
}

function toOutpointSpend(res: {
  spent?: boolean;
  status?: { confirmed?: boolean; block_height?: number };
}): OutpointSpend {
  return {
    spent: res.spent === true,
    confirmed: res.spent === true && res.status?.confirmed === true,
    blockHeight: res.status?.block_height,
  };
}

export function useReclaimStatus(
  outpoints: ReadonlyArray<ReclaimOutpoint>,
): ReclaimStatusResult {
  const queryClient = useQueryClient();

  // Dedupe by vault id and sort so list churn doesn't refetch.
  const stable = useMemo(() => {
    const map = new Map<string, ReclaimOutpoint>();
    for (const o of outpoints) {
      if (!o.depositId || !o.peginTxid) continue;
      const depositId = o.depositId.toLowerCase();
      map.set(depositId, { ...o, depositId });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.depositId.localeCompare(b.depositId),
    );
  }, [outpoints]);

  const enabled = stable.length > 0;
  const queryKey = useMemo(
    () =>
      [
        RECLAIM_STATUS_QUERY_KEY,
        stable.map((o) => o.depositId).join(","),
      ] as const,
    [stable],
  );

  const query = useQuery({
    queryKey,
    enabled,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<ReclaimBatch> => {
      const apiUrl = getMempoolApiUrl();
      const prior =
        queryClient.getQueryData<ReclaimBatch>(queryKey)?.statuses ?? new Map();

      // The tip is shared across the batch, and a failure to read it must not
      // drop the whole poll — the gate treats an absent tip as "not yet known"
      // and simply withholds the action.
      const tipHeight = await getTipHeight(apiUrl).catch(() => undefined);

      const entries = await mapWithConcurrency(
        stable,
        MAX_CONCURRENT_VAULTS,
        async (o): Promise<[string, ReclaimStatus] | null> => {
          try {
            const [payout, reserve, reserveUtxo] = await Promise.all([
              getOutspend(o.peginTxid, PEGIN_VAULT_VOUT, apiUrl),
              getOutspend(o.peginTxid, PEGIN_DEPOSITOR_CLAIM_VOUT, apiUrl),
              getUtxoInfo(o.peginTxid, PEGIN_DEPOSITOR_CLAIM_VOUT, apiUrl),
            ]);
            return [
              o.depositId,
              {
                payoutSpend: toOutpointSpend(payout),
                reserveSpend: toOutpointSpend(reserve),
                reserveValueSats: BigInt(reserveUtxo.value),
              },
            ];
          } catch {
            // Carry the prior status forward so a transient 429 doesn't drop a
            // row for a cycle. No prior means the row stays actionless, which
            // is the fail-closed direction.
            const priorStatus = prior.get(o.depositId);
            return priorStatus !== undefined
              ? [o.depositId, priorStatus]
              : null;
          }
        },
      );

      return {
        statuses: new Map(
          entries.filter((e): e is [string, ReclaimStatus] => e !== null),
        ),
        tipHeight,
      };
    },
  });

  return {
    statusByDepositId: query.data?.statuses ?? EMPTY_STATUSES,
    tipHeight: query.data?.tipHeight,
  };
}
