/**
 * Pure helpers for the "Awaiting Bitcoin confirmation" detail panel.
 *
 * The deposit waits for the Pre-PegIn tx to reach the protocol-mandated
 * confirmation depth (`minPrepeginDepth`, on-chain offchain param). These
 * helpers turn raw mempool data + that depth into the counter and estimate
 * the panel renders — no countdown, since block arrivals are not schedulable.
 */

/** Bitcoin difficulty retargeting aims for one block every 10 minutes. */
const AVG_BTC_BLOCK_MINUTES = 10;

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
  return (requiredDepth - confirmations) * AVG_BTC_BLOCK_MINUTES;
}
