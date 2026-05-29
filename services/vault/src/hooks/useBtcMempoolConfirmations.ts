// Generic mempool confirmation poller for a set of BTC txids. Returns raw
// counts keyed by canonical txid; the consumer applies its own threshold.

import { getTipHeight } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { fetchConfirmations } from "@/clients/btc/confirmations";
import { canonicalizeTxid } from "@/utils/txid";

// 60s tick catches each ~10-min block within a minute while halving requests.
const POLL_INTERVAL_MS = 60 * 1000;
// Just under the poll interval so refocus/remount doesn't double-fetch.
const STALE_TIME_MS = 55 * 1000;
// Cap concurrency — the public mempool.space endpoint rate-limits (429s).
const MAX_CONCURRENT_REQUESTS = 4;

export interface BtcMempoolConfirmationsResult {
  /** Canonical (lowercased, no 0x) txid → confirmation count. Missing = unknown. */
  confirmationsByTxid: Map<string, number>;
}

// Run `task` over items with at most `concurrency` in flight; preserves order.
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

export function useBtcMempoolConfirmations(
  txids: ReadonlyArray<string | undefined>,
  queryKeyRoot: string,
): BtcMempoolConfirmationsResult {
  const queryClient = useQueryClient();

  // Stable, deduped, sorted key — order changes must not refetch.
  const uniqueTxids = useMemo(() => {
    const set = new Set<string>();
    for (const t of txids) {
      const canonical = canonicalizeTxid(t);
      if (canonical && canonical.length > 0) set.add(canonical);
    }
    return Array.from(set).sort();
  }, [txids]);

  const enabled = uniqueTxids.length > 0;
  const queryKey = useMemo(
    () => [queryKeyRoot, uniqueTxids.join(",")] as const,
    [queryKeyRoot, uniqueTxids],
  );

  const query = useQuery({
    queryKey,
    enabled,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    // Preserve the prior batch across queryKey changes so list churn doesn't
    // flicker unchanged txids back to "unknown" until the next fetch lands.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const apiUrl = getMempoolApiUrl();
      const tipHeight = await getTipHeight(apiUrl);
      // Carry prior known counts forward on per-txid error so a transient 429
      // or network blip doesn't flicker a row backward for one cycle.
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
