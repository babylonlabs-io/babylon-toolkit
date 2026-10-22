// Generic mempool confirmation poller for a set of BTC txids. Returns raw
// counts keyed by canonical txid (`null` when the mempool API does not find a
// tx and has not found it for MAX_NOT_FOUND_CARRY_MS); the consumer applies
// its own threshold.

import {
  getTipHeight,
  MempoolNotFoundError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { fetchConfirmations } from "@/clients/btc/confirmations";
import { mapWithConcurrency } from "@/utils/concurrency";
import { canonicalizeTxid } from "@/utils/txid";

// 60s tick catches each ~10-min block within a minute while halving requests.
const POLL_INTERVAL_MS = 60 * 1000;
// Just under the poll interval so refocus/remount doesn't double-fetch.
const STALE_TIME_MS = 55 * 1000;
// Cap concurrency — the public mempool.space endpoint rate-limits (429s).
const MAX_CONCURRENT_REQUESTS = 4;
// A known count survives a run of 404s for at most this long. A lagging
// mempool.space node can 404 a known tx for a poll or two. A longer run means
// the tx left the mempool, so the txid drops to not found. Other errors (429,
// outage) say nothing about the tx and keep the count.
const MAX_NOT_FOUND_CARRY_MS = 3 * POLL_INTERVAL_MS;

// Singleton for the no-data render: same identity-stability reasoning as
// `EMPTY_REFUNDS` in useBtcHtlcRefundStatus — a per-render `new Map()` makes
// every consumer memo recompute on every render while the query is disabled
// or unloaded, and React Query's structural sharing cannot share Maps.
const EMPTY_CONFIRMATIONS = new Map<string, number | null>();

interface ConfirmationsData {
  confirmations: Map<string, number | null>;
  // Canonical txid to the time of its first 404 since its last successful
  // lookup. Kept in the query cache with the counts, so a remount keeps it.
  notFoundSince: Map<string, number>;
}

const selectConfirmations = (data: ConfirmationsData) => data.confirmations;

export interface BtcMempoolConfirmationsResult {
  /** Canonical txid to count. Null means not found; absent means unknown. */
  confirmationsByTxid: Map<string, number | null>;
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
    select: selectConfirmations,
    queryFn: async (): Promise<ConfirmationsData> => {
      const apiUrl = getMempoolApiUrl();
      const tipHeight = await getTipHeight(apiUrl);
      // Carry this query key's prior counts forward on per-txid error so a
      // transient 429 or network blip doesn't flicker a row backward for one
      // cycle. A prior count wins over a 404 until MAX_NOT_FOUND_CARRY_MS; a
      // prior `null` is kept only on a 404.
      const prior = queryClient.getQueryData<ConfirmationsData>(queryKey);
      const now = Date.now();
      const notFoundSince = new Map<string, number>();
      const entries = await mapWithConcurrency(
        uniqueTxids,
        MAX_CONCURRENT_REQUESTS,
        async (txid): Promise<[string, number | null] | null> => {
          try {
            const confs = await fetchConfirmations(txid, apiUrl, tipHeight);
            return [txid, confs];
          } catch (error) {
            const since = prior?.notFoundSince.get(txid);
            const priorConfs = prior?.confirmations.get(txid);
            if (!(error instanceof MempoolNotFoundError)) {
              if (since !== undefined) notFoundSince.set(txid, since);
              return typeof priorConfs === "number" ? [txid, priorConfs] : null;
            }
            const firstNotFound = since ?? now;
            notFoundSince.set(txid, firstNotFound);
            const carried =
              now - firstNotFound < MAX_NOT_FOUND_CARRY_MS
                ? priorConfs
                : undefined;
            return [txid, carried ?? null];
          }
        },
      );
      return {
        confirmations: new Map(
          entries.filter((e): e is [string, number | null] => e !== null),
        ),
        notFoundSince,
      };
    },
  });

  return { confirmationsByTxid: query.data ?? EMPTY_CONFIRMATIONS };
}
