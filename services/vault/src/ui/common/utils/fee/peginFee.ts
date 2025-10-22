/**
 * Fee Estimation for BTC Peg-In Transactions
 *
 * This module calculates transaction fees based on estimated transaction size (vbytes)
 * and fee rate (sat/vbyte). The estimation follows the same methodology as btc-staking-ts
 * but is optimized for peg-in transactions which have a simpler, fixed structure.
 *
 * Transaction structure:
 * - 1 P2TR input (depositor's UTXO)
 * - 1 P2TR output (peg-in output to vault)
 * - Optionally 1 P2TR change output (if change > dust threshold)
 *
 * Key differences from btc-staking-ts:
 * - Peg-in uses exactly 1 input (currently), making fee calculation deterministic
 * - btc-staking-ts supports multiple inputs, requiring iterative UTXO selection
 * - Peg-in can pre-calculate maximum possible fee for efficient UTXO selection
 */

/**
 * TRANSACTION SIZE CONSTANTS
 *
 * These constants are empirically measured from actual Bitcoin P2TR transactions.
 * They represent the virtual size (vbytes) of different transaction components.
 *
 * Reference: btc-staking-ts constants (proven in production)
 */

/**
 * P2TR (Pay-to-Taproot) input size in vbytes
 *
 * Breakdown:
 * - Outpoint: 36 bytes (txid: 32 bytes + vout: 4 bytes)
 * - ScriptSig: 1 byte (empty for SegWit)
 * - Sequence: 4 bytes
 * - Witness data: ~64 bytes signature / 4 = ~16 vbytes (Schnorr signature)
 *
 * Total: 42 vbytes (non-witness) + 16 vbytes (witness) = 58 vbytes
 */
const P2TR_INPUT_SIZE = 58;

/**
 * P2TR (Pay-to-Taproot) output size in bytes
 *
 * P2TR is the largest non-legacy output type.
 *
 * Breakdown:
 * - Value: 8 bytes (amount in satoshis)
 * - ScriptPubKey length: 1 byte (varint)
 * - ScriptPubKey: 34 bytes (OP_1 [1 byte] + 32-byte taproot output key [32 bytes] + varint [1 byte])
 *
 * Total: 43 bytes
 */
const MAX_NON_LEGACY_OUTPUT_SIZE = 43;

/**
 * Base transaction overhead in bytes
 *
 * Components that appear once per transaction regardless of input/output counts:
 * - Version: 4 bytes (transaction version number)
 * - Input count: 1 byte (varint, for 1-252 inputs)
 * - Output count: 1 byte (varint, for 1-252 outputs)
 * - Locktime: 4 bytes (block height or timestamp)
 * - SegWit marker + flag: 2 bytes (0x00 0x01 for SegWit)
 *
 * Total: 11 bytes
 *
 * Note: For larger input/output counts (>252), varint size increases,
 * but this is rare for typical transactions.
 */
const TX_BUFFER_SIZE_OVERHEAD = 11;

/**
 * Safety margin multiplier for fee estimates
 *
 * Adds 10% buffer to calculated fees to account for:
 * - Minor variations in actual transaction size vs estimates
 * - Mempool congestion and fee market volatility
 * - Ensuring reliable transaction confirmation
 *
 * This prevents transactions from getting stuck due to slightly
 * underestimated fees, especially important for time-sensitive peg-ins.
 *
 * Trade-off: Users pay slightly more (~10%) for better reliability.
 */
const FEE_SAFETY_MARGIN = 1.1;

/**
 * Bitcoin dust threshold in satoshis
 *
 * Outputs with value below this threshold are considered "dust" and:
 * - May not be relayed by nodes (anti-spam)
 * - Cost more to spend than they're worth (in typical fee environments)
 * - Should be avoided in transaction creation
 *
 * Standard: 546 satoshis for P2TR outputs
 * Rationale: Cost to spend a P2TR output at 1 sat/vbyte ≈ 58 sats
 *           546 sats provides ~9.4x headroom for fee market fluctuations
 */
const DUST_THRESHOLD = 546n;

/**
 * Estimates the transaction fee for a peg-in transaction with safety margin
 *
 * Algorithm:
 * 1. Calculate base fee (1 input + 1 output + overhead)
 * 2. Determine if change output is needed (change > dust threshold)
 * 3. If yes, recalculate fee including change output
 * 4. Handle edge case: If fee increase causes change to drop below dust,
 *    revert to no-change fee (extra sats become additional miner fee)
 * 5. Apply 10% safety margin
 *
 * Edge case handling is critical: Without it, we might calculate a fee that
 * assumes a change output, but the change would actually be dust, leading to
 * a stuck transaction (insufficient fee).
 *
 * @param peginAmount - Amount to peg in (in satoshis)
 * @param depositValue - Value of the deposit UTXO being spent (in satoshis)
 * @param feeRate - Fee rate in satoshis per vbyte (from mempool API)
 * @returns Estimated transaction fee in satoshis (with safety margin applied)
 *
 * @example
 * Peg-in 0.01 BTC from 0.015 BTC UTXO at 10 sat/vb:
 *
 * `const fee = estimatePeginFee(1_000_000n, 1_500_000n, 10);`
 * Returns: ~1705 sats (155 vbytes * 10 sat/vb * 1.1 margin)
 * Change: 1_500_000 - 1_000_000 - 1705 = 498_295 sats (> dust, so change output created)
 */
export function estimatePeginFee(
  peginAmount: bigint,
  depositValue: bigint,
  feeRate: number,
): bigint {
  // Step 1: Calculate base transaction size and fee
  // Structure: 1 input + 1 output (pegin) + overhead
  // This is the minimum size (no change output)
  const baseTxSize =
    P2TR_INPUT_SIZE + MAX_NON_LEGACY_OUTPUT_SIZE + TX_BUFFER_SIZE_OVERHEAD;
  const baseFee = BigInt(Math.ceil(baseTxSize * feeRate));

  // Step 2: Calculate potential change with base fee
  let changeAmount = depositValue - peginAmount - baseFee;

  // Step 3: If change > dust threshold, we need a change output
  // This increases transaction size and therefore fee
  let finalFee = baseFee;
  if (changeAmount > DUST_THRESHOLD) {
    // Calculate additional fee for change output
    const changeOutputFee = BigInt(
      Math.ceil(MAX_NON_LEGACY_OUTPUT_SIZE * feeRate),
    );
    finalFee = baseFee + changeOutputFee;

    // Step 4: CRITICAL EDGE CASE HANDLING
    // Recalculate change with the increased fee
    changeAmount = depositValue - peginAmount - finalFee;

    // If change dropped below dust due to fee increase, revert to base fee
    // The extra satoshis (change < dust) go to miners as additional fee
    // This is better than creating a dust output which may not be relayed
    if (changeAmount <= DUST_THRESHOLD) {
      finalFee = baseFee;
      // Effective fee paid = baseFee + dust change (< 546 sats)
      // Miners get slightly more, but transaction reliably confirms
    }
  }

  // Step 5: Apply safety margin (10%)
  // Ensures transaction confirms even if:
  // - Witness size is slightly larger than estimated
  // - Fee market increases between estimation and broadcast
  // - Other minor variations in actual vs estimated size
  const feeWithMargin = BigInt(Math.ceil(Number(finalFee) * FEE_SAFETY_MARGIN));

  return feeWithMargin;
}

/**
 * Calculates the MAXIMUM possible fee for any peg-in transaction
 *
 * This represents the worst-case scenario: a transaction with a change output
 * (2 outputs instead of 1), which is the largest possible peg-in transaction.
 *
 * Usage: UTXO selection
 * When selecting a UTXO for peg-in, use this function to find a UTXO where:
 *   utxoValue >= peginAmount + getMaxPeginFee(feeRate)
 *
 * This guarantees the selected UTXO can cover the peg-in amount plus fees,
 * regardless of whether a change output is needed. After selection, use
 * estimatePeginFee() to calculate the actual fee (which will be <= max fee).
 *
 * Why not just use estimatePeginFee() for selection?
 * Because we don't know in advance whether there will be change:
 * - If we underestimate, UTXO might be insufficient
 * - Using max fee ensures we always have enough
 * - Actual fee calculation happens after UTXO selection
 *
 * @param feeRate - Fee rate in satoshis per vbyte (from mempool API)
 * @returns Maximum possible fee in satoshis (with safety margin applied)
 *
 * @example
 * At 10 sat/vb, what's the maximum fee I might pay?
 * `const maxFee = getMaxPeginFee(10);`
 * Returns: ~1705 sats ((58 + 43 + 43 + 11) * 10 * 1.1)
 *
 * Use for UTXO selection:
 * ```
 * const suitableUTXO = utxos.find(
 *   u => u.value >= peginAmount + getMaxPeginFee(feeRate)
 * );
 * ```
 */
export function getMaxPeginFee(feeRate: number): bigint {
  // Maximum size: 1 input + 2 outputs (pegin + change) + overhead
  const maxTxSize =
    P2TR_INPUT_SIZE + 2 * MAX_NON_LEGACY_OUTPUT_SIZE + TX_BUFFER_SIZE_OVERHEAD;

  const maxFee = BigInt(Math.ceil(maxTxSize * feeRate));

  // Apply safety margin
  const maxFeeWithMargin = BigInt(
    Math.ceil(Number(maxFee) * FEE_SAFETY_MARGIN),
  );

  return maxFeeWithMargin;
}

/**
 * FUTURE ENHANCEMENT: Multi-Input Support
 *
 * When peg-in transactions support multiple input UTXOs, this function
 * can be used to estimate fees for transactions with N inputs.
 *
 * Current limitation: Peg-in only supports 1 input UTXO
 * Future: Allow combining multiple small UTXOs for larger peg-ins
 *
 * Implementation would follow btc-staking-ts pattern:
 * - Iteratively select UTXOs until sum >= peginAmount + estimatedFee
 * - Recalculate fee as more inputs are added (larger tx = higher fee)
 * - Stop when accumulated value covers amount + fee + dust (for change)
 *
 * Example signature:
 *
 * export function estimatePeginFeeMultiInput(
 *   peginAmount: bigint,
 *   inputValues: bigint[],
 *   feeRate: number,
 * ): { selectedInputIndices: number[]; fee: bigint } {
 *   const numInputs = inputValues.length;
 *   const inputSize = numInputs * P2TR_INPUT_SIZE;
 *
 *   Base size with N inputs + 1 output
 *   const baseTxSize = inputSize + MAX_NON_LEGACY_OUTPUT_SIZE + TX_BUFFER_SIZE_OVERHEAD;
 *
 *   Calculate fee with/without change output (similar to single-input logic)
 *   ...
 *
 *   return { selectedInputIndices: [0, 1, 2], fee: calculatedFee };
 * }
 */
