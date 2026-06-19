/**
 * Mempool-API helper that reports whether a Pre-PegIn HTLC output has been
 * spent (i.e. the depositor's CSV refund has landed). A pure BTC refund emits
 * no Ethereum event, so neither the indexer nor the BTC monitor sees it today —
 * the frontend reads the spend status directly from the esplora-compatible
 * `outspend` endpoint.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import { getOutspend } from "@babylonlabs-io/ts-sdk/tbv/core/clients";

export interface HtlcSpend {
  /** True when the HTLC output has been spent (in the mempool or a block). */
  spent: boolean;
  /** True only when the spending tx is confirmed in a block. */
  confirmed: boolean;
  /** Spending (refund) transaction id, when spent. */
  spendingTxid?: string;
}

/**
 * Returns the spend status of a vault's HTLC output `(prePeginTxHash,
 * htlcVout)`. Callers handle errors (404, 429, network blips) at their layer.
 */
export async function fetchHtlcSpend(
  prePeginTxHash: string,
  htlcVout: number,
  apiUrl: string,
): Promise<HtlcSpend> {
  const res = await getOutspend(
    stripHexPrefix(prePeginTxHash),
    htlcVout,
    apiUrl,
  );
  return {
    spent: res.spent === true,
    confirmed: res.spent === true && res.status?.confirmed === true,
    spendingTxid: res.txid,
  };
}
