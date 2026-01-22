/**
 * UTXO selection utilities for peg-in transactions.
 * Follows btc-staking-ts methodology with iterative fee calculation.
 */

import { script as bitcoinScript } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import {
  BTC_DUST_SAT,
  DUST_THRESHOLD,
  MAX_NON_LEGACY_OUTPUT_SIZE,
  P2TR_INPUT_SIZE,
  rateBasedTxBufferFee,
  TX_BUFFER_SIZE_OVERHEAD,
} from "../fee/constants";

/**
 * Unspent Transaction Output (UTXO) for funding peg-in transactions.
 */
export interface UTXO {
  /**
   * Transaction ID of the UTXO (64-char hex without 0x prefix).
   */
  txid: string;

  /**
   * Output index within the transaction.
   */
  vout: number;

  /**
   * Value in satoshis.
   */
  value: number;

  /**
   * Script public key hex.
   */
  scriptPubKey: string;
}

export interface UTXOSelectionResult {
  selectedUTXOs: UTXO[];
  totalValue: bigint;
  fee: bigint;
  changeAmount: bigint;
}

/**
 * Selects UTXOs to fund a peg-in transaction with iterative fee calculation.
 *
 * This function implements the btc-staking-ts approach:
 * 1. Filter UTXOs for script validity (no minimum value filter)
 * 2. Sort by value (largest first) to minimize number of inputs
 * 3. Iteratively add UTXOs and recalculate fee until we have enough
 *
 * The fee recalculation is critical because:
 * - Each UTXO added increases transaction size → increases fee
 * - More fee needed might require another UTXO
 * - Change output detection affects fee (adds output size if needed)
 *
 * @param availableUTXOs - All available UTXOs from wallet
 * @param peginAmount - Amount to peg in (satoshis)
 * @param feeRate - Fee rate (sat/vbyte)
 * @returns Selected UTXOs, total value, calculated fee, and change amount
 * @throws Error if insufficient funds or no valid UTXOs
 */
export function selectUtxosForPegin(
  availableUTXOs: UTXO[],
  peginAmount: bigint,
  feeRate: number,
): UTXOSelectionResult {
  if (availableUTXOs.length === 0) {
    throw new Error("Insufficient funds: no UTXOs available");
  }

  // Filter for script validity ONLY (matching btc-staking-ts approach)
  // No minimum value filter - we accept any UTXO with valid script
  const validUTXOs = availableUTXOs.filter((utxo) => {
    const script = Buffer.from(utxo.scriptPubKey, "hex");
    const decompiledScript = bitcoinScript.decompile(script);
    return !!decompiledScript;
  });

  if (validUTXOs.length === 0) {
    throw new Error(
      "Insufficient funds: no valid UTXOs available (all have invalid scripts)",
    );
  }

  // Sort by value: HIGHEST to LOWEST (use big UTXOs first)
  // Use spread to avoid mutating the original array
  const sortedUTXOs = [...validUTXOs].sort((a, b) => b.value - a.value);

  const selectedUTXOs: UTXO[] = [];
  let accumulatedValue = 0n;
  let estimatedFee = 0n;

  // Iteratively select UTXOs and recalculate fee
  for (const utxo of sortedUTXOs) {
    selectedUTXOs.push(utxo);
    accumulatedValue += BigInt(utxo.value);

    // Recalculate fee based on CURRENT number of inputs
    const inputSize = selectedUTXOs.length * P2TR_INPUT_SIZE;
    const outputSize = MAX_NON_LEGACY_OUTPUT_SIZE; // 1 pegin output
    const baseTxSize = inputSize + outputSize + TX_BUFFER_SIZE_OVERHEAD;

    // Calculate base fee with buffer
    estimatedFee =
      BigInt(Math.ceil(baseTxSize * feeRate)) +
      BigInt(rateBasedTxBufferFee(feeRate));

    // Check if there will be change left after pegin amount and fee
    const changeAmount = accumulatedValue - peginAmount - estimatedFee;

    // If change is above dust, add fee for change output
    if (changeAmount > DUST_THRESHOLD) {
      const changeOutputFee = BigInt(
        Math.ceil(MAX_NON_LEGACY_OUTPUT_SIZE * feeRate),
      );
      estimatedFee += changeOutputFee;
    }

    // Check if we have enough to cover pegin amount + fees
    if (accumulatedValue >= peginAmount + estimatedFee) {
      // Success! We have enough funds
      const finalChangeAmount = accumulatedValue - peginAmount - estimatedFee;

      return {
        selectedUTXOs,
        totalValue: accumulatedValue,
        fee: estimatedFee,
        changeAmount: finalChangeAmount,
      };
    }
  }

  // If we get here, we don't have enough funds
  throw new Error(
    `Insufficient funds: need ${peginAmount + estimatedFee} sats (${peginAmount} pegin + ${estimatedFee} fee), have ${accumulatedValue} sats`,
  );
}

/**
 * Checks if change amount is above dust threshold.
 *
 * @param changeAmount - Change amount in satoshis
 * @returns true if change should be added as output, false if it should go to miners
 */
export function shouldAddChangeOutput(changeAmount: bigint): boolean {
  return changeAmount > DUST_THRESHOLD;
}

/**
 * Gets the dust threshold value.
 *
 * @returns Dust threshold in satoshis
 */
export function getDustThreshold(): number {
  return BTC_DUST_SAT;
}
