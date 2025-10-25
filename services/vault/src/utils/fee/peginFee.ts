/**
 * Fee estimation for BTC peg-in transactions.
 * Follows btc-staking-ts methodology with support for multiple input UTXOs.
 */

import {
  BTC_DUST_SAT,
  MAX_NON_LEGACY_OUTPUT_SIZE,
  P2TR_INPUT_SIZE,
  rateBasedTxBufferFee,
  TX_BUFFER_SIZE_OVERHEAD,
} from "./constants";

// Safety margin: 10% buffer for size variations and fee market volatility
const FEE_SAFETY_MARGIN = 1.1;

/**
 * Estimates transaction fee for peg-in with support for multiple input UTXOs.
 *
 * @param peginAmount - Amount to peg in (satoshis)
 * @param depositUTXOs - Input UTXOs with their values (satoshis)
 * @param feeRate - Fee rate (sat/vbyte)
 * @returns Estimated fee with 10% safety margin (satoshis)
 */
export function estimatePeginFee(
  peginAmount: bigint,
  depositUTXOs: Array<{ value: bigint }>,
  feeRate: number,
): bigint {
  // Calculate total input value and size
  const totalInputValue = depositUTXOs.reduce(
    (sum, utxo) => sum + utxo.value,
    0n,
  );
  const inputSize = depositUTXOs.length * P2TR_INPUT_SIZE;

  // Base fee: N inputs + 1 output (pegin) + overhead + buffer
  const baseTxSize =
    inputSize + MAX_NON_LEGACY_OUTPUT_SIZE + TX_BUFFER_SIZE_OVERHEAD;
  const baseFee =
    BigInt(Math.ceil(baseTxSize * feeRate)) +
    BigInt(rateBasedTxBufferFee(feeRate));

  // Check if change output is needed
  let changeAmount = totalInputValue - peginAmount - baseFee;
  let finalFee = baseFee;

  const DUST_THRESHOLD = BigInt(BTC_DUST_SAT);
  if (changeAmount > DUST_THRESHOLD) {
    // Add fee for change output
    const changeOutputFee = BigInt(
      Math.ceil(MAX_NON_LEGACY_OUTPUT_SIZE * feeRate),
    );
    finalFee = baseFee + changeOutputFee;

    // Recalculate change with increased fee
    changeAmount = totalInputValue - peginAmount - finalFee;

    // If change drops below dust, revert to base fee (dust goes to miners)
    if (changeAmount <= DUST_THRESHOLD) {
      finalFee = baseFee;
    }
  }

  // Apply safety margin
  return BigInt(Math.ceil(Number(finalFee) * FEE_SAFETY_MARGIN));
}
