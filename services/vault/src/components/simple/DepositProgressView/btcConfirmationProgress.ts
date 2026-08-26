/**
 * Pure helpers for the deposit-progress duration estimates: the "Awaiting
 * Bitcoin confirmation" detail panel's counter and the card header's total.
 *
 * The deposit waits for the Pre-PegIn tx to reach the protocol-mandated
 * confirmation depth (`minPrepeginDepth`, on-chain offchain param). These
 * helpers turn raw mempool data + that depth into the counter and estimates
 * the card renders — no countdown, since block arrivals are not schedulable.
 */

import { BTC_BLOCK_TIME_MINS } from "@/constants";

// Machine-paced pegin overhead beyond BTC confirmations: ACK round, two ETH
// txs, indexer surfacing, and poll quantization. BTC depth accrues in
// parallel with the VP pipeline, so it is an additive allowance, not a sum.
const DEPOSIT_PIPELINE_OVERHEAD_MINS = 10;

/**
 * Confirmation count for a transaction given the current chain tip.
 * Unconfirmed (mempool) is 0; the block that includes the tx is the 1st.
 */
export function computeConfirmations(
  status: { confirmed: boolean; block_height?: number },
  tipHeight: number,
): number {
  if (!status.confirmed) return 0;
  if (status.block_height === undefined) {
    throw new Error("Confirmed transaction is missing block_height");
  }
  return Math.max(0, tipHeight - status.block_height + 1);
}

/**
 * Estimated minutes until the Pre-PegIn reaches `requiredDepth`, at Bitcoin's
 * ~10-minute block target. Returns `null` once the depth is met — there is no
 * remaining wait to estimate and the deposit is finalizing.
 */
export function computeRemainingEstimateMinutes(
  confirmations: number,
  requiredDepth: number,
): number | null {
  if (confirmations >= requiredDepth) return null;
  return (requiredDepth - confirmations) * BTC_BLOCK_TIME_MINS;
}

/**
 * Estimated machine-paced total for the whole deposit flow, shown in the card
 * header. BTC confirmations dominate by design and accrue in parallel with
 * the VP pipeline, so it's depth × block time plus a fixed overhead
 * allowance. User-paced signing steps are excluded.
 */
export function computeTotalEstimateMinutes(requiredDepth: number): number {
  return requiredDepth * BTC_BLOCK_TIME_MINS + DEPOSIT_PIPELINE_OVERHEAD_MINS;
}
