/**
 * Mempool-API helper that reports whether a Pre-PegIn HTLC output has been
 * spent, and by which transaction. A spend is either the depositor's CSV
 * refund or the vault's PegIn sweeping the deposit into the BTCVault — tell
 * them apart with `isHtlcSpentByPegin` below. A pure BTC refund emits no
 * Ethereum event, so neither the indexer nor the BTC monitor sees it today —
 * the frontend reads the spend status directly from the esplora-compatible
 * `outspend` endpoint.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import { getOutspend } from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { normalizeChainHeight } from "@/models/reclaimEligibility";
import { canonicalizeTxid } from "@/utils/txid";

export interface HtlcSpend {
  /** True when the HTLC output has been spent (in the mempool or a block). */
  spent: boolean;
  /** True only when the spending tx is confirmed in a block. */
  confirmed: boolean;
  /** Spending transaction id (the refund or the PegIn), when spent. */
  spendingTxid?: string;
  /**
   * Height of the block containing the spending tx, when confirmed. Used by
   * the reclaim gate, which needs confirmation depth rather than a boolean —
   * see `models/reclaimEligibility`.
   */
  blockHeight?: number;
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
    // `getOutspend` returns the parsed body verbatim, so the declared
    // `number | undefined` is not a guarantee about the value.
    blockHeight: normalizeChainHeight(res.status?.block_height),
  };
}

/**
 * Whether the PegIn, not a refund, spent a vault's HTLC.
 *
 * A spend is only a refund if somebody other than the PegIn made it; when the
 * PegIn is the spender the BTC moved INTO the BTCVault. Positive proof only: a
 * missing `spendingTxid` or PegIn txid reads as false. The display, the
 * stuck-state probe and the refunded-HTLC cache all attribute through this,
 * and the cache and the refund flow also refuse a spend reported without its
 * transaction (the refund flow names it only after an "already in chain"
 * rejection, which proves the spender is its own refund), so a PegIn sweep is
 * not recorded as a refund. The expired-vault redeem checks it before acting.
 */
export function isHtlcSpentByPegin(
  spend: HtlcSpend | undefined,
  peginTxHash: string | undefined,
): boolean {
  const peginTxCanonical = canonicalizeTxid(peginTxHash);
  return (
    spend?.spent === true &&
    peginTxCanonical !== undefined &&
    canonicalizeTxid(spend.spendingTxid) === peginTxCanonical
  );
}
