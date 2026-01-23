/**
 * Deposit-related business constants
 *
 * These are domain constants that don't change based on contract state.
 */

/**
 * Maximum deposit amount in satoshis (21M BTC - Bitcoin's max supply)
 * This is a protocol-wide constant representing the theoretical maximum.
 */
export const MAX_DEPOSIT_SATS = 21_000_000_00_000_000n;

/**
 * Default minimum deposit in satoshis (used as fallback during loading)
 * This is a conservative value - the actual value comes from the contract.
 * Set to 10,000 satoshis (0.0001 BTC) as a reasonable anti-spam minimum.
 */
export const DEFAULT_MIN_DEPOSIT_SATS = 10_000n;
