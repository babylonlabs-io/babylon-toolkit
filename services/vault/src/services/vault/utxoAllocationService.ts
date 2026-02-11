/**
 * UTXO Allocation Service (POC)
 *
 * Determines allocation strategy for multiple vaults:
 * - SPLIT: Create a split transaction to generate N UTXOs
 * - MULTI_UTXO: Use existing UTXOs (one per vault)
 * - SINGLE: Use one UTXO for one vault (edge case)
 *
 * This service plans the allocation but doesn't create transactions yet.
 * Transaction creation is handled separately.
 */

import type { UTXO } from "@babylonlabs-io/ts-sdk/tbv/core";
import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import type {
  AllocationPlan,
  AllocationStrategy,
  SplitTransaction,
  VaultAllocation,
} from "@/types/multiVault";

/**
 * Plan UTXO allocation for multiple vaults
 *
 * Algorithm:
 * 1. If numVaults === 1: Use existing UTXO selection (SINGLE strategy)
 * 2. If availableUtxos.length >= numVaults: Use existing UTXOs (MULTI_UTXO)
 * 3. Otherwise: Need to create split transaction (SPLIT)
 *
 * @param availableUtxos - Available UTXOs from wallet
 * @param vaultAmounts - Amount for each vault in satoshis
 * @param feeRate - Fee rate in sat/vByte
 * @param changeAddress - BTC address for change
 * @returns Allocation plan with strategy and UTXO assignments
 */
export function planUtxoAllocation(
  availableUtxos: UTXO[],
  vaultAmounts: bigint[],
  feeRate: number,
  changeAddress: string,
): AllocationPlan {
  const numVaults = vaultAmounts.length;

  // Edge case: Single vault (use existing selection logic)
  if (numVaults === 1) {
    return {
      needsSplit: false,
      vaultAllocations: [
        {
          vaultIndex: 0,
          amount: vaultAmounts[0],
          utxo: null, // Will be selected by standard flow
          fromSplit: false,
        },
      ],
    };
  }

  // Check if we have enough UTXOs
  const strategy: AllocationStrategy =
    availableUtxos.length >= numVaults ? "MULTI_UTXO" : "SPLIT";

  if (strategy === "MULTI_UTXO") {
    return planMultiUtxoAllocation(availableUtxos, vaultAmounts);
  } else {
    return planSplitAllocation(
      availableUtxos,
      vaultAmounts,
      feeRate,
      changeAddress,
    );
  }
}

/**
 * Plan allocation using existing UTXOs (one UTXO per vault)
 *
 * Sorts UTXOs by value descending and matches them to vaults.
 * Validates that each UTXO has enough value for its vault.
 */
function planMultiUtxoAllocation(
  availableUtxos: UTXO[],
  vaultAmounts: bigint[],
): AllocationPlan {
  // Sort UTXOs by value descending
  const sortedUtxos = [...availableUtxos].sort((a, b) => b.value - a.value);

  // Sort vault amounts descending to match large UTXOs with large vaults
  const sortedVaultIndices = vaultAmounts
    .map((amount, index) => ({ amount, index }))
    .sort((a, b) => Number(b.amount - a.amount));

  const allocations: VaultAllocation[] = [];

  for (let i = 0; i < vaultAmounts.length; i++) {
    const vaultInfo = sortedVaultIndices[i];
    const utxo = sortedUtxos[i];

    if (!utxo) {
      throw new Error(
        `Insufficient UTXOs: Need ${vaultAmounts.length}, have ${availableUtxos.length}`,
      );
    }

    // Check if UTXO has enough value (rough check, exact fee calc happens later)
    if (BigInt(utxo.value) < vaultInfo.amount) {
      console.warn(
        `[UTXO Allocation] UTXO ${i} (${utxo.value} sats) might be too small for vault ${vaultInfo.index} (${vaultInfo.amount} sats)`,
      );
    }

    allocations.push({
      vaultIndex: vaultInfo.index,
      amount: vaultInfo.amount,
      utxo,
      fromSplit: false,
    });
  }

  // Sort back by vault index for consistent ordering
  allocations.sort((a, b) => a.vaultIndex - b.vaultIndex);

  return {
    needsSplit: false,
    vaultAllocations: allocations,
  };
}

/**
 * Estimate the fee for a single pegin transaction
 *
 * @param feeRate - Fee rate in sats/vByte
 * @returns Estimated fee in satoshis
 */
function estimatePeginTransactionFee(feeRate: number): number {
  // Typical pegin transaction structure:
  // - 1 input (depositor's UTXO): ~58 vBytes (P2TR)
  // - 1 output (vault output): ~43 vBytes (P2TR)
  // - 1 change output (if needed): ~43 vBytes (P2TR)
  // - Transaction overhead: ~11 vBytes
  // Total: ~155 vBytes
  const estimatedSize = 155;
  return Math.ceil(estimatedSize * feeRate);
}

/**
 * Plan allocation using UTXO split transaction
 *
 * Creates a plan for a split transaction that generates N outputs (one per vault).
 * The split transaction is created but not signed yet.
 *
 * IMPORTANT: Split outputs must be large enough to cover BOTH:
 * 1. The user's requested vault amount
 * 2. The pegin transaction fee (deducted during pegin creation)
 */
function planSplitAllocation(
  availableUtxos: UTXO[],
  vaultAmounts: bigint[],
  feeRate: number,
  changeAddress: string,
): AllocationPlan {
  // Calculate total amount needed for vaults
  const totalVaultAmount = vaultAmounts.reduce(
    (sum, amount) => sum + amount,
    0n,
  );

  // Estimate split transaction fee
  // Rough estimate: assume 1 input, N outputs + 1 change
  // P2TR input ~58 vBytes, P2TR output ~43 vBytes, overhead ~11 vBytes
  const numOutputs = vaultAmounts.length + 1; // vault outputs + change
  const estimatedSplitSize = 58 + numOutputs * 43 + 11;
  const estimatedSplitFee = BigInt(Math.ceil(estimatedSplitSize * feeRate));

  // Estimate total pegin fees (one pegin transaction per vault)
  const peginFeePerVault = BigInt(estimatePeginTransactionFee(feeRate));
  const totalPeginFees = peginFeePerVault * BigInt(vaultAmounts.length);

  // Total amount needed: vault amounts + split fee + pegin fees
  const totalNeeded = totalVaultAmount + estimatedSplitFee + totalPeginFees;

  // Select UTXOs to cover total needed
  const selectedUtxos = selectUtxosForSplit(availableUtxos, totalNeeded);

  if (!selectedUtxos || selectedUtxos.length === 0) {
    throw new Error(
      `Insufficient funds for split: need ${totalNeeded} sats (${totalVaultAmount} vaults + ${estimatedSplitFee} split fee + ${totalPeginFees} pegin fees)`,
    );
  }

  // Calculate split transaction outputs
  // Each output = vault amount + full pegin fee buffer
  // The split fee is NOT deducted from outputs - it's paid from the change
  // This ensures each pegin transaction has enough funds (vault amount + fee)
  const outputs = vaultAmounts.map((amount, i) => {
    // Output = vault amount + pegin fee (NO split fee deduction)
    const outputAmount = amount + peginFeePerVault;

    return {
      amount: outputAmount,
      address: changeAddress,
      vout: i,
    };
  });

  // Calculate change output
  // Input value - output values - split fee = change
  const totalInputValue = selectedUtxos.reduce(
    (sum, u) => sum + BigInt(u.value),
    0n,
  );
  const totalOutputValue = outputs.reduce((sum, o) => sum + o.amount, 0n);
  const change = totalInputValue - totalOutputValue - estimatedSplitFee;

  // Add change output if above dust threshold (546 sats)
  const DUST_THRESHOLD = 546n;
  if (change > DUST_THRESHOLD) {
    outputs.push({
      amount: change,
      address: changeAddress,
      vout: outputs.length,
    });
  } else if (change > 0n) {
    console.log(
      `[UTXO Allocation] Change ${change} sats below dust threshold, adding to split fee`,
    );
  }

  // Create unsigned split transaction
  const splitTx = createUnsignedSplitTransaction(selectedUtxos, outputs);

  // Create allocations referencing split tx outputs
  const allocations: VaultAllocation[] = vaultAmounts.map((_, i) => ({
    vaultIndex: i,
    amount: outputs[i].amount, // Use adjusted amount (after fee deduction)
    utxo: null, // Will be created by split tx
    fromSplit: true,
    splitTxOutputIndex: i,
  }));

  return {
    needsSplit: true,
    splitTransaction: splitTx,
    vaultAllocations: allocations,
  };
}

/**
 * Select UTXOs to cover a target amount
 * Simple largest-first selection
 */
function selectUtxosForSplit(
  availableUtxos: UTXO[],
  targetAmount: bigint,
): UTXO[] {
  const sorted = [...availableUtxos].sort((a, b) => b.value - a.value);
  const selected: UTXO[] = [];
  let accumulated = 0n;

  for (const utxo of sorted) {
    selected.push(utxo);
    accumulated += BigInt(utxo.value);

    if (accumulated >= targetAmount) {
      return selected;
    }
  }

  throw new Error(
    `Insufficient funds: need ${targetAmount} sats, have ${accumulated} sats`,
  );
}

/**
 * Create unsigned split transaction
 *
 * This creates a transaction that splits input UTXOs into multiple outputs.
 * Returns unsigned hex and deterministic txid.
 */
function createUnsignedSplitTransaction(
  inputs: UTXO[],
  outputs: Array<{ amount: bigint; address: string; vout: number }>,
): SplitTransaction {
  // For now, create a minimal transaction structure
  // Actual transaction building will be done in Phase 4
  // This is a placeholder that returns the structure

  const tx = new Transaction();
  tx.version = 2;

  // Add inputs (without signatures)
  for (const utxo of inputs) {
    const txidBuffer = Buffer.from(utxo.txid, "hex").reverse();
    tx.addInput(txidBuffer, utxo.vout);
  }

  // Add outputs
  // Note: We can't create proper P2TR outputs without the full address decoding
  // For now, create placeholder outputs
  for (const output of outputs) {
    // Placeholder: use a dummy script
    // In Phase 4, we'll decode the actual address and create proper scripts
    const dummyScript = Buffer.alloc(34); // P2TR is 34 bytes
    tx.addOutput(dummyScript, Number(output.amount));
  }

  const txHex = tx.toHex();
  const txid = tx.getId();

  return {
    inputs,
    outputs: outputs.map((o) => ({
      amount: o.amount,
      address: o.address,
      vout: o.vout,
    })),
    txHex,
    txid,
  };
}
