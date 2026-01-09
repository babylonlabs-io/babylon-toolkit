/**
 * Pure calculation functions for deposit operations
 * No side effects, no state, just pure transformations
 */

import {
  MAX_NON_LEGACY_OUTPUT_SIZE,
  P2TR_INPUT_SIZE,
  rateBasedTxBufferFee,
  TX_BUFFER_SIZE_OVERHEAD,
} from "../../utils/fee/constants";
import type { UTXO } from "../vault/vaultTransactionService";

export interface DepositFees {
  btcNetworkFee: bigint;
  protocolFee: bigint;
  totalFee: bigint;
}

export interface DepositAmountBreakdown {
  depositAmount: bigint;
  fees: DepositFees;
  totalRequired: bigint;
  changeAmount: bigint;
}

/**
 * Estimate BTC network fee based on fee rate and estimated input count.
 * Uses the same constants as the SDK's selectUtxosForPegin for consistency.
 *
 * @param feeRate - Fee rate in sat/vbyte
 * @param estimatedInputCount - Estimated number of inputs (default: 1)
 * @param includeChange - Whether to include change output in calculation (default: true)
 * @returns Estimated fee in satoshis
 */
export function estimateBtcNetworkFee(
  feeRate: number,
  estimatedInputCount = 1,
  includeChange = true,
): bigint {
  const inputSize = estimatedInputCount * P2TR_INPUT_SIZE;
  const outputSize = MAX_NON_LEGACY_OUTPUT_SIZE;
  const baseTxSize = inputSize + outputSize + TX_BUFFER_SIZE_OVERHEAD;

  let fee =
    BigInt(Math.ceil(baseTxSize * feeRate)) +
    BigInt(rateBasedTxBufferFee(feeRate));

  if (includeChange) {
    fee += BigInt(Math.ceil(MAX_NON_LEGACY_OUTPUT_SIZE * feeRate));
  }

  return fee;
}

/**
 * Calculate fees for a deposit transaction.
 * Uses dynamic fee calculation based on the provided fee rate.
 *
 * @param depositAmount - Amount to deposit in satoshis
 * @param feeRate - Fee rate in sat/vbyte (optional, defaults to estimate for 1 input)
 * @returns Fee breakdown
 */
export function calculateDepositFees(
  depositAmount: bigint,
  feeRate?: number,
): DepositFees {
  const btcNetworkFee = feeRate
    ? estimateBtcNetworkFee(feeRate)
    : estimateBtcNetworkFee(10);

  // Protocol fee: 0.1% of deposit amount
  const protocolFee = (depositAmount * 10n) / 10000n;

  return {
    btcNetworkFee,
    protocolFee,
    totalFee: btcNetworkFee + protocolFee,
  };
}

/**
 * Select optimal UTXOs for a deposit
 * Pure function that selects UTXOs without modifying input
 * @param utxos - Available UTXOs
 * @param targetAmount - Target amount including fees
 * @returns Selected UTXOs and total value
 */
export function selectOptimalUTXOs(
  utxos: UTXO[],
  targetAmount: bigint,
): { selected: UTXO[]; totalValue: bigint } {
  // Sort UTXOs by value (largest first for optimal selection)
  const sortedUTXOs = [...utxos].sort((a, b) => Number(b.value - a.value));

  const selected: UTXO[] = [];
  let totalValue = 0n;

  // Select UTXOs until we have enough
  for (const utxo of sortedUTXOs) {
    if (totalValue >= targetAmount) break;

    selected.push(utxo);
    totalValue += BigInt(utxo.value);
  }

  return { selected, totalValue };
}

/**
 * Calculate estimated transaction size in bytes
 * @param inputCount - Number of inputs
 * @param outputCount - Number of outputs
 * @returns Estimated size in bytes
 */
export function estimateTransactionSize(
  inputCount: number,
  outputCount: number,
): number {
  // P2TR input: ~58 bytes (witness)
  // P2TR output: ~43 bytes
  // Base overhead: ~11 bytes
  const BASE_SIZE = 11;
  const INPUT_SIZE = 58;
  const OUTPUT_SIZE = 43;

  return BASE_SIZE + INPUT_SIZE * inputCount + OUTPUT_SIZE * outputCount;
}

/**
 * Calculate the minimum deposit amount based on current fees
 * @param feeRate - Current fee rate in sats/byte
 * @returns Minimum viable deposit amount
 */
export function calculateMinimumDeposit(feeRate: number): bigint {
  // Minimum should cover at least the transaction fees plus a reasonable deposit
  const minTxSize = estimateTransactionSize(1, 2); // 1 input, 2 outputs (deposit + change)
  const minFee = BigInt(minTxSize * feeRate);
  const MIN_DEPOSIT_BASE = 10000n; // 0.0001 BTC minimum

  return MIN_DEPOSIT_BASE + minFee;
}
