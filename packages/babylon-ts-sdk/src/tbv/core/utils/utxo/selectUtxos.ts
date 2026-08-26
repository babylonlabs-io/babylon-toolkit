/**
 * UTXO selection utilities for peg-in transactions.
 * Follows btc-staking-ts methodology with iterative fee calculation.
 */

import { script as bitcoinScript } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { BTC_DUST_SAT, DUST_THRESHOLD } from "../fee/constants";
import {
  applyChangeOutputPolicy,
  computeChangeOutputFeeSats,
  computePeginBaseFeeSats,
} from "../fee/peginFeeMath";

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
 * Assert that no two UTXOs share the same txid:vout outpoint.
 * Duplicates from a buggy or compromised UTXO source would produce
 * an invalid Bitcoin transaction that double-spends the same outpoint.
 */
function assertNoDuplicateUtxos(utxos: UTXO[]): void {
  const seen = new Set<string>();
  for (const utxo of utxos) {
    const key = `${utxo.txid.toLowerCase()}:${utxo.vout}`;
    if (seen.has(key)) {
      throw new Error(
        `Duplicate UTXO detected: ${utxo.txid}:${utxo.vout}. ` +
          `This indicates a data integrity issue with the UTXO source.`,
      );
    }
    seen.add(key);
  }
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
 * @param numOutputs - Number of outputs in the unfunded transaction (HTLC + CPFP anchor, before change)
 * @returns Selected UTXOs, total value, calculated fee, and change amount
 * @throws Error if insufficient funds or no valid UTXOs
 */
export function selectUtxosForPegin(
  availableUTXOs: UTXO[],
  peginAmount: bigint,
  feeRate: number,
  numOutputs: number,
): UTXOSelectionResult {
  if (!Number.isInteger(numOutputs) || numOutputs < 1) {
    throw new Error(
      `Invalid numOutputs: expected a positive integer, got ${numOutputs}`,
    );
  }

  if (availableUTXOs.length === 0) {
    throw new Error("Insufficient funds: no UTXOs available");
  }

  assertNoDuplicateUtxos(availableUTXOs);

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

  // Iteratively select UTXOs, recalculating the fee through the shared
  // `applyChangeOutputPolicy` helper so the selector and the funder
  // agree on (fee, change output emission, change amount) for the same
  // inputs. Without that, the funder can omit a change output the
  // selector charged for — silent depositor overpayment at the dust
  // boundary.
  for (const utxo of sortedUTXOs) {
    selectedUTXOs.push(utxo);
    accumulatedValue += BigInt(utxo.value);

    const baseFee = computePeginBaseFeeSats({
      numInputs: selectedUTXOs.length,
      numOutputs,
      feeRate,
    });
    const changeOutputFee = computeChangeOutputFeeSats(feeRate);

    if (accumulatedValue < peginAmount + baseFee) {
      estimatedFee = baseFee;
      continue;
    }

    const policy = applyChangeOutputPolicy({
      totalInputValue: accumulatedValue,
      peginAmount,
      baseFee,
      changeOutputFee,
    });

    return {
      selectedUTXOs,
      totalValue: accumulatedValue,
      fee: policy.fee,
      changeAmount: policy.changeAmount,
    };
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
