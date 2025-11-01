/**
 * Pure calculation functions for deposit operations
 * No side effects, no state, just pure transformations
 */

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
 * Calculate fees for a deposit transaction
 * @param depositAmount - Amount to deposit in satoshis
 * @param utxoCount - Number of UTXOs that will be used
 * @returns Fee breakdown
 */
export function calculateDepositFees(
  depositAmount: bigint,
  utxoCount: number
): DepositFees {
  // Base fee calculation (simplified for now)
  const BASE_TX_SIZE = 150; // bytes
  const PER_INPUT_SIZE = 180; // bytes
  const FEE_RATE = 10; // sats per byte
  
  const estimatedSize = BASE_TX_SIZE + (PER_INPUT_SIZE * utxoCount);
  const btcNetworkFee = BigInt(estimatedSize * FEE_RATE);
  
  // Protocol fee: 0.1% of deposit amount
  const protocolFee = (depositAmount * 10n) / 10000n;
  
  return {
    btcNetworkFee,
    protocolFee,
    totalFee: btcNetworkFee + protocolFee
  };
}

/**
 * Calculate the total amount breakdown for a deposit
 * @param depositAmount - Amount to deposit
 * @param availableBalance - Total available balance from UTXOs
 * @param utxoCount - Number of UTXOs to be used
 * @returns Complete amount breakdown
 */
export function calculateDepositAmountBreakdown(
  depositAmount: bigint,
  availableBalance: bigint,
  utxoCount: number
): DepositAmountBreakdown {
  const fees = calculateDepositFees(depositAmount, utxoCount);
  const totalRequired = depositAmount + fees.totalFee;
  const changeAmount = availableBalance > totalRequired 
    ? availableBalance - totalRequired 
    : 0n;
  
  return {
    depositAmount,
    fees,
    totalRequired,
    changeAmount
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
  targetAmount: bigint
): { selected: UTXO[]; totalValue: bigint } {
  // Sort UTXOs by value (largest first for optimal selection)
  const sortedUTXOs = [...utxos].sort((a, b) => 
    Number(b.value - a.value)
  );
  
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
  outputCount: number
): number {
  // P2TR input: ~58 bytes (witness)
  // P2TR output: ~43 bytes
  // Base overhead: ~11 bytes
  const BASE_SIZE = 11;
  const INPUT_SIZE = 58;
  const OUTPUT_SIZE = 43;
  
  return BASE_SIZE + (INPUT_SIZE * inputCount) + (OUTPUT_SIZE * outputCount);
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
