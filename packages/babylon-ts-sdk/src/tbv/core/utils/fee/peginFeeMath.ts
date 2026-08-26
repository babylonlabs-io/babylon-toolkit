/**
 * Pre-PegIn fee math primitives used by both UTXO selection and
 * transaction funding so they make bit-identical decisions about base
 * fee, change-output fee, and whether to emit change at all.
 *
 * Dust handling matches the wallet-side check in
 * `babylon-vault crates/btc-wallet-remote/src/client.rs` (dust-change
 * rejection): a change output is emitted only when the post-fee residual
 * exceeds DUST_THRESHOLD (546 sats). Broader fee-estimation behaviors
 * (output sizing, safety margins) are NOT cross-stack guarantees — see
 * JS-vs-Rust parity fixtures in `__tests__/peginFeeMath.test.ts` for the
 * invariants we pin.
 */

import {
  DUST_THRESHOLD,
  MAX_NON_LEGACY_OUTPUT_SIZE,
  P2TR_INPUT_SIZE,
  rateBasedTxBufferFee,
  TX_BUFFER_SIZE_OVERHEAD,
} from "./constants";

export interface ComputeBaseFeeParams {
  numInputs: number;
  /**
   * Number of outputs in the unfunded transaction (HTLC vault outputs +
   * CPFP anchor + optional auth-anchor OP_RETURN). Excludes the change
   * output — `applyChangeOutputPolicy` adds the change-output fee
   * separately.
   */
  numOutputs: number;
  feeRate: number;
}

/**
 * Compute the base fee (sats) for a Pre-PegIn transaction with no change
 * output, including the low-fee-rate buffer.
 *
 * Used as the starting point by `applyChangeOutputPolicy`, which then
 * decides whether to add the incremental change-output fee.
 */
export function computePeginBaseFeeSats(
  params: ComputeBaseFeeParams,
): bigint {
  const { numInputs, numOutputs, feeRate } = params;
  if (!Number.isInteger(numInputs) || numInputs < 0) {
    throw new Error(
      `computePeginBaseFeeSats: numInputs must be a non-negative integer, got ${numInputs}`,
    );
  }
  if (!Number.isInteger(numOutputs) || numOutputs < 1) {
    throw new Error(
      `computePeginBaseFeeSats: numOutputs must be a positive integer, got ${numOutputs}`,
    );
  }
  const txVsize =
    numInputs * P2TR_INPUT_SIZE +
    numOutputs * MAX_NON_LEGACY_OUTPUT_SIZE +
    TX_BUFFER_SIZE_OVERHEAD;
  return (
    BigInt(Math.ceil(txVsize * feeRate)) +
    BigInt(rateBasedTxBufferFee(feeRate))
  );
}

/**
 * Incremental fee (sats) for adding one P2TR-sized change output at the
 * given fee rate. Does NOT include the low-fee-rate buffer — that is part
 * of the base fee, paid once per transaction.
 */
export function computeChangeOutputFeeSats(feeRate: number): bigint {
  return BigInt(Math.ceil(MAX_NON_LEGACY_OUTPUT_SIZE * feeRate));
}

export interface ApplyChangeOutputPolicyParams {
  totalInputValue: bigint;
  peginAmount: bigint;
  baseFee: bigint;
  changeOutputFee: bigint;
}

export interface ChangeOutputPolicyResult {
  /** Final transaction fee (sats). */
  fee: bigint;
  /**
   * Final change amount (sats). 0n when no change output is emitted.
   * When `emitChangeOutput` is false, the would-be change is paid to
   * miners as part of `fee` — i.e. it is dust by policy.
   */
  changeAmount: bigint;
  /** Whether the funded transaction must include a change output. */
  emitChangeOutput: boolean;
}

/**
 * Apply the change-output dust policy: emit a change output iff the
 * post-change-output-fee residual strictly exceeds DUST_THRESHOLD.
 *
 * Returns `{ fee, changeAmount, emitChangeOutput }` so the selector and
 * funder both end up with the same fee and same change decision for the
 * same inputs.
 *
 * Inputs:
 * - `totalInputValue`: sum of selected UTXO values
 * - `peginAmount`: amount being pegged in
 * - `baseFee`: fee assuming no change output (from `computePeginBaseFeeSats`)
 * - `changeOutputFee`: incremental fee for adding one change output
 *   (from `computeChangeOutputFeeSats`)
 *
 * @throws If `totalInputValue < peginAmount + baseFee` (insufficient funds
 *   even before considering change). Callers that need to surface
 *   "insufficient funds" with their own error wording should check the
 *   precondition themselves before invoking this.
 */
export function applyChangeOutputPolicy(
  params: ApplyChangeOutputPolicyParams,
): ChangeOutputPolicyResult {
  const { totalInputValue, peginAmount, baseFee, changeOutputFee } = params;

  const residualBeforeChange = totalInputValue - peginAmount - baseFee;
  if (residualBeforeChange < 0n) {
    throw new Error(
      `applyChangeOutputPolicy: insufficient funds (need ${peginAmount + baseFee} sats, have ${totalInputValue})`,
    );
  }

  const residualWithChangeOutput = residualBeforeChange - changeOutputFee;
  if (residualWithChangeOutput > DUST_THRESHOLD) {
    return {
      fee: baseFee + changeOutputFee,
      changeAmount: residualWithChangeOutput,
      emitChangeOutput: true,
    };
  }

  // Dust-revert: the would-be change is below (or equal to) the dust
  // threshold once the change-output fee is paid, so we omit the change
  // output and let the residual go to miners. The reported `fee` is the
  // ACTUAL on-wire fee — `baseFee + residualBeforeChange` — not just
  // `baseFee`, otherwise fee displays would under-report by up to
  // (changeOutputFee + DUST_THRESHOLD) sats whenever dust gets absorbed.
  return {
    fee: baseFee + residualBeforeChange,
    changeAmount: 0n,
    emitChangeOutput: false,
  };
}

export interface ComputeMaxDepositParams {
  numInputs: number;
  /**
   * Number of outputs in the unfunded transaction. Use the worst-case
   * count for the use case being budgeted (e.g. max-batch with
   * auth-anchor) — `computeMaxDeposit` is intentionally an UPPER BOUND
   * and assumes no change output.
   */
  numOutputs: number;
  totalBalance: bigint;
  feeRate: number;
}

/**
 * Compute the maximum depositable amount (sats) given a fixed-cost
 * sweep: every UTXO is spent, no change output is emitted, fee is the
 * base fee for the requested input/output count.
 *
 * Returns null when `totalBalance <= 0n`. Returns 0n if the base fee
 * alone exceeds the balance.
 */
export function computeMaxDeposit(
  params: ComputeMaxDepositParams,
): bigint | null {
  const { numInputs, numOutputs, totalBalance, feeRate } = params;
  if (totalBalance <= 0n) return null;
  const fee = computePeginBaseFeeSats({ numInputs, numOutputs, feeRate });
  const max = totalBalance - fee;
  return max > 0n ? max : 0n;
}
