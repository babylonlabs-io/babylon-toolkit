// Centralized poller for whether each EXPIRED vault's Pre-PegIn HTLC output
// has been spent (the depositor's CSV refund). Mirrors
// `useBtcMempoolConfirmations`: one batched query, concurrency-capped against
// the public mempool.space rate limit, keyed by vault id (siblings of a
// batched Pre-PegIn share a txid but own distinct HTLC outputs).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { fetchHtlcSpend, type HtlcSpend } from "@/clients/btc/outspend";
import { mapWithConcurrency } from "@/utils/concurrency";

// 60s tick mirrors the confirmation poller — a refund confirms on a ~10-min
// block, so a minute of latency is immaterial while halving requests.
const POLL_INTERVAL_MS = 60 * 1000;
// Just under the poll interval so refocus/remount doesn't double-fetch.
const STALE_TIME_MS = 55 * 1000;
// Cap concurrency — the public mempool.space endpoint rate-limits (429s).
const MAX_CONCURRENT_REQUESTS = 4;

/** One vault's HTLC outpoint to probe for a refund spend. */
export interface HtlcRefundOutpoint {
  /** Vault id (the result map's key). */
  depositId: string;
  /** Pre-PegIn tx hash funding the HTLC output. */
  prePeginTxHash: string;
  /** Index of this vault's HTLC output in the Pre-PegIn tx. */
  htlcVout: number;
}

export interface BtcHtlcRefundStatusResult {
  /** Vault id (lowercased) → HTLC spend status. Missing = not yet polled. */
  refundByDepositId: Map<string, HtlcSpend>;
}

export function useBtcHtlcRefundStatus(
  outpoints: ReadonlyArray<HtlcRefundOutpoint>,
  queryKeyRoot: string,
): BtcHtlcRefundStatusResult {
  const queryClient = useQueryClient();

  // Dedupe by vault id and sort so list churn / reordering doesn't refetch.
  const stable = useMemo(() => {
    const map = new Map<string, HtlcRefundOutpoint>();
    for (const o of outpoints) {
      if (!o.depositId || !o.prePeginTxHash) continue;
      if (!Number.isInteger(o.htlcVout) || o.htlcVout < 0) continue;
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
        queryKeyRoot,
        stable.map((o) => `${o.depositId}:${o.htlcVout}`).join(","),
      ] as const,
    [queryKeyRoot, stable],
  );

  const query = useQuery({
    queryKey,
    enabled,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    // Keep the prior batch across queryKey changes so list churn doesn't
    // flicker a known status back to "unknown" until the next fetch lands.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const apiUrl = getMempoolApiUrl();
      // Carry prior known status forward on per-vault error so a transient
      // 429/network blip doesn't drop a row for one cycle.
      const prior =
        queryClient.getQueryData<Map<string, HtlcSpend>>(queryKey) ?? new Map();
      const entries = await mapWithConcurrency(
        stable,
        MAX_CONCURRENT_REQUESTS,
        async (o): Promise<[string, HtlcSpend] | null> => {
          try {
            const spend = await fetchHtlcSpend(
              o.prePeginTxHash,
              o.htlcVout,
              apiUrl,
            );
            return [o.depositId, spend];
          } catch {
            const priorSpend = prior.get(o.depositId);
            return priorSpend !== undefined ? [o.depositId, priorSpend] : null;
          }
        },
      );
      return new Map<string, HtlcSpend>(
        entries.filter((e): e is [string, HtlcSpend] => e !== null),
      );
    },
  });

  return { refundByDepositId: query.data ?? new Map() };
}
