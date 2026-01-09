/**
 * Fee calculation constants for BTC transactions.
 * These values match the SDK's constants for consistency.
 */

/**
 * Estimated virtual size (vbytes) of a single P2TR input.
 * P2TR_INPUT_SIZE = 36 (outpoint: txid + vout) +
 *                    1 (scriptSig length, always 0 for segwit but encoded) +
 *                    4 (sequence) +
 *                   16 (discounted witness + small safety buffer) +
 *                    1 (varint overhead / rounding buffer)
 * = 58 vbytes (chosen to exactly match the SDK's assumed size).
 */
export const P2TR_INPUT_SIZE = 58;

/**
 * Maximum size (in bytes) of a standard non-legacy output.
 * MAX_NON_LEGACY_OUTPUT_SIZE = 8 (amount) +
 *                              1 (scriptPubKey length varint) +
 *                             34 (typical scriptPubKey, e.g. P2PKH/P2SH-compatible)
 * = 43 bytes.
 */
export const MAX_NON_LEGACY_OUTPUT_SIZE = 43;

/**
 * Approximate transaction-level overhead (in bytes) that is not accounted for
 * by simply summing input and output sizes.
 * TX_BUFFER_SIZE_OVERHEAD = 4 (version) +
 *                           4 (locktime) +
 *                           1 (input count varint) +
 *                           1 (output count varint) +
 *                           1 (segwit marker/flag and misc rounding buffer)
 * = 11 bytes (aligned with the SDK's constant).
 */
export const TX_BUFFER_SIZE_OVERHEAD = 11;

/**
 * Extra safety buffer (in virtual bytes) applied when fee-rate estimation
 * is less accurate at very low fee rates. This helps avoid underestimating
 * required fees near the relay minimum.
 * LOW_RATE_ESTIMATION_ACCURACY_BUFFER = 30 vbytes (per SDK).
 */
export const LOW_RATE_ESTIMATION_ACCURACY_BUFFER = 30;

/**
 * Fee-rate threshold (in sat/vbyte) below which we consider fee estimates
 * to be less reliable and apply LOW_RATE_ESTIMATION_ACCURACY_BUFFER.
 * WALLET_RELAY_FEE_RATE_THRESHOLD = 2 sat/vbyte (per SDK).
 */
export const WALLET_RELAY_FEE_RATE_THRESHOLD = 2;

export const rateBasedTxBufferFee = (feeRate: number): number => {
  return feeRate <= WALLET_RELAY_FEE_RATE_THRESHOLD
    ? LOW_RATE_ESTIMATION_ACCURACY_BUFFER
    : 0;
};
