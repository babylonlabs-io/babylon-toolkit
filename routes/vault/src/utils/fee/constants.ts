/**
 * Fee calculation constants for Bitcoin transactions.
 * Based on btc-staking-ts values, adapted for vault peg-in transactions.
 */

// P2TR input size in vbytes (42 vbytes non-witness + 16 vbytes witness)
export const P2TR_INPUT_SIZE = 58;

// P2TR output size in bytes (largest non-legacy output type)
export const MAX_NON_LEGACY_OUTPUT_SIZE = 43;

// Base transaction overhead (version, input/output counts, locktime, SegWit marker)
export const TX_BUFFER_SIZE_OVERHEAD = 11;

// Dust threshold: outputs below this may not be relayed
export const BTC_DUST_SAT = 546;

// Buffer for low fee rate estimation accuracy (when feeRate <= 2 sat/vbyte)
export const LOW_RATE_ESTIMATION_ACCURACY_BUFFER = 30;

// Wallet relay fee rate threshold - different buffer fees are used based on this
export const WALLET_RELAY_FEE_RATE_THRESHOLD = 2;

/**
 * Adds a buffer to the transaction fee calculation if the fee rate is low.
 *
 * Some wallets have a relayer fee requirement. If the fee rate is <= 2 sat/vbyte,
 * there's a risk the fee might not be sufficient for transaction relay.
 * We add a buffer to ensure the transaction can be relayed.
 *
 * @param feeRate - Fee rate in satoshis per vbyte
 * @returns Buffer amount in satoshis to add to the transaction fee
 */
export function rateBasedTxBufferFee(feeRate: number): number {
  return feeRate <= WALLET_RELAY_FEE_RATE_THRESHOLD
    ? LOW_RATE_ESTIMATION_ACCURACY_BUFFER
    : 0;
}
