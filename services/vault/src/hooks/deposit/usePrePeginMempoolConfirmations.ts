/**
 * Mempool ground-truth signal for "Pre-PegIn confirmation depth?".
 *
 * The dashboard otherwise infers "broadcast happened" from localStorage
 * (`CONFIRMING`), which can't tell BTC-wait from VP-stuck: localStorage stays
 * `CONFIRMING` whether the VP is still ingesting or BTC is still confirming.
 * Polling the mempool directly per pending Pre-PegIn txid resolves that
 * ambiguity for the state machine, which routes the deposit to either
 * `AWAIT_BTC_CONFIRMATION` or `AWAIT_VP_INGESTION` based on the result.
 *
 * Returns raw confirmation counts (not pre-thresholded). Per-deposit depth
 * is applied at the consumer because each vault is locked to its own
 * `offchainParamsVersion` — comparing to a single "latest" depth here would
 * silently misclassify older deposits if governance ever bumped the value.
 *
 * Batched by unique txid so sibling vaults in a batched pegin (one BTC tx,
 * many vaults) share a single fetch.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import { getTipHeight } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { fetchConfirmations } from "@/clients/btc/confirmations";

/**
 * Dashboard cadence — Bitcoin blocks arrive ~every 10 min, so a 60s tick
 * still catches each block within ~one minute while halving the per-tab
 * mempool request volume compared to the in-flow modal's 30s poller. This
 * runs across all pending deposits, possibly while the section is collapsed,
 * so a slower cadence than the in-flow modal is the right tradeoff.
 */
const POLL_INTERVAL_MS = 60 * 1000;

/**
 * Just under the poll interval so tab refocus / remount doesn't trigger a
 * second fetch within the same cycle, while still guaranteeing the periodic
 * `refetchInterval` always fires.
 */
const STALE_TIME_MS = 55 * 1000;

/**
 * Cap on concurrent `getTxInfo` requests per tick. The default mempool
 * endpoint is the public `mempool.space`, which rate-limits with 429s and
 * docs an explicit ban policy for repeat offenders — without a cap, a user
 * with batched pegins or many parallel deposits would fire N requests in
 * one burst every cycle. 4 keeps the peak friendly while letting a typical
 * (single-digit-N) user complete in one batch.
 */
const MAX_CONCURRENT_REQUESTS = 4;

const QUERY_KEY_ROOT = "prePeginMempoolConfirmations";

export interface PrePeginMempoolConfirmationsResult {
  /**
   * Map keyed by canonical (lowercased, no `0x`) Pre-PegIn txid → confirmation
   * count on chain. Missing key = unknown (first fetch not yet resolved, or
   * the tx is not in the mempool/chain and never has been).
   */
  confirmationsByTxid: Map<string, number>;
}

function canonicalize(txid: string): string {
  return stripHexPrefix(txid).toLowerCase();
}

/**
 * Run `task` against each item with at most `concurrency` in flight at
 * once. Preserves input order in the result and never throws — caller
 * decides how to handle individual failures by what `task` returns.
 */
async function mapWithConcurrency<T, R>(
  items: ReadonlyArray<T>,
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= items.length) return;
        results[i] = await task(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export function usePrePeginMempoolConfirmations(
  txids: ReadonlyArray<string | undefined>,
): PrePeginMempoolConfirmationsResult {
  const queryClient = useQueryClient();

  // Stable, deduped, sorted key — order changes in `activities` must not
  // refetch unnecessarily.
  const uniqueTxids = useMemo(() => {
    const set = new Set<string>();
    for (const t of txids) {
      if (t && t.length > 0) set.add(canonicalize(t));
    }
    return Array.from(set).sort();
  }, [txids]);

  const enabled = uniqueTxids.length > 0;
  const queryKey = useMemo(
    () => [QUERY_KEY_ROOT, uniqueTxids.join(",")] as const,
    [uniqueTxids],
  );

  const query = useQuery({
    queryKey,
    enabled,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    // Preserve the prior batch across queryKey changes (a new pending pegin
    // appearing/disappearing rotates the key). Without this, every list churn
    // discards what we knew about unchanged txids and flickers their rows
    // back to AWAIT_BTC_CONFIRMATION until the next fetch completes.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const apiUrl = getMempoolApiUrl();
      const tipHeight = await getTipHeight(apiUrl);
      // Carry prior known confirmation counts forward on per-txid error so a
      // transient 429 or network blip doesn't flicker an already-confirmed
      // deposit's row backward to AWAIT_BTC_CONFIRMATION for one cycle.
      const prior =
        queryClient.getQueryData<Map<string, number>>(queryKey) ?? new Map();
      const entries = await mapWithConcurrency(
        uniqueTxids,
        MAX_CONCURRENT_REQUESTS,
        async (txid): Promise<[string, number] | null> => {
          try {
            const confs = await fetchConfirmations(txid, apiUrl, tipHeight);
            return [txid, confs];
          } catch {
            const priorConfs = prior.get(txid);
            return priorConfs !== undefined ? [txid, priorConfs] : null;
          }
        },
      );
      return new Map<string, number>(
        entries.filter((e): e is [string, number] => e !== null),
      );
    },
  });

  return { confirmationsByTxid: query.data ?? new Map() };
}
