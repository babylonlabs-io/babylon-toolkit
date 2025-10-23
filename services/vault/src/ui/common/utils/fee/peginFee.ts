/**
 * Fee estimation for BTC peg-in transactions.
 * Follows btc-staking-ts methodology with support for multiple input UTXOs.
 */

// P2TR input size in vbytes (42 vbytes non-witness + 16 vbytes witness)
const P2TR_INPUT_SIZE = 58;

// P2TR output size in bytes (largest non-legacy output type)
const MAX_NON_LEGACY_OUTPUT_SIZE = 43;

// Base transaction overhead (version, input/output counts, locktime, SegWit marker)
const TX_BUFFER_SIZE_OVERHEAD = 11;

// Safety margin: 10% buffer for size variations and fee market volatility
const FEE_SAFETY_MARGIN = 1.1;

// Dust threshold: outputs below this may not be relayed
const DUST_THRESHOLD = 546n;

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

  // Base fee: N inputs + 1 output (pegin) + overhead
  const baseTxSize =
    inputSize + MAX_NON_LEGACY_OUTPUT_SIZE + TX_BUFFER_SIZE_OVERHEAD;
  const baseFee = BigInt(Math.ceil(baseTxSize * feeRate));

  // Check if change output is needed
  let changeAmount = totalInputValue - peginAmount - baseFee;
  let finalFee = baseFee;

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
