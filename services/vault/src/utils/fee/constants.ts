/**
 * Fee calculation constants for BTC transactions.
 * These values match the SDK's constants for consistency.
 */

export const P2TR_INPUT_SIZE = 58;
export const MAX_NON_LEGACY_OUTPUT_SIZE = 43;
export const TX_BUFFER_SIZE_OVERHEAD = 11;
export const LOW_RATE_ESTIMATION_ACCURACY_BUFFER = 30;
export const WALLET_RELAY_FEE_RATE_THRESHOLD = 2;

export const rateBasedTxBufferFee = (feeRate: number): number => {
  return feeRate <= WALLET_RELAY_FEE_RATE_THRESHOLD
    ? LOW_RATE_ESTIMATION_ACCURACY_BUFFER
    : 0;
};
