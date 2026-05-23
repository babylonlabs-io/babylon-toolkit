/**
 * Polls the Bitcoin mempool for the confirmation count of a transaction.
 *
 * Backs the "Awaiting Bitcoin confirmation" panel: confirmations are a fact
 * on the chain, so the panel shows real progress toward the protocol-mandated
 * Pre-PegIn depth rather than a wall-clock countdown to unschedulable blocks.
 */

import { getTipHeight } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { useQuery } from "@tanstack/react-query";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { fetchConfirmations } from "@/clients/btc/confirmations";

/** Bitcoin blocks arrive ~every 10 min; a 30s poll catches each promptly. */
const CONFIRMATION_POLL_INTERVAL_MS = 30 * 1000;

export interface BtcConfirmationsResult {
  /**
   * Confirmation count, or null while the first fetch runs or on error.
   * Null and a real 0 are distinct: 0 means "broadcast, not yet mined".
   */
  confirmations: number | null;
}

/**
 * @param txid - Pre-PegIn broadcast txid; pass `null` to disable polling.
 */
export function useBtcConfirmations(
  txid: string | null,
): BtcConfirmationsResult {
  const enabled = txid !== null && txid.length > 0;

  const query = useQuery({
    queryKey: ["btcConfirmations", txid],
    enabled,
    refetchInterval: CONFIRMATION_POLL_INTERVAL_MS,
    queryFn: async () => {
      if (!txid) throw new Error("useBtcConfirmations: txid is required");
      const apiUrl = getMempoolApiUrl();
      const tipHeight = await getTipHeight(apiUrl);
      return fetchConfirmations(txid, apiUrl, tipHeight);
    },
  });

  return { confirmations: query.data ?? null };
}
