/**
 * Minimum deposit amount in satoshis (0.0001 BTC)
 *
 * This is a fixed minimum - fee validation happens during UTXO selection
 * in the review modal where we have the actual fee rate.
 */
export const MIN_DEPOSIT_SATS = 10_000n;
