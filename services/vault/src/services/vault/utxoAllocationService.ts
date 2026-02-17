/**
 * UTXO Allocation Service for multi-vault deposits.
 *
 * Determines the optimal strategy for allocating UTXOs across one or two vaults:
 *
 * - SINGLE:     1 vault → trivial plan; standard pegin flow selects its own UTXOs.
 * - MULTI_UTXO: 2 vaults, 2+ sufficient UTXOs → assign one UTXO per vault directly.
 * - SPLIT:      2 vaults, insufficient separate UTXOs → build a Bitcoin split
 *               transaction that fans one UTXO out into two vault-sized outputs.
 *
 * Fee philosophy
 * --------------
 * All fee estimates are intentionally conservative (slightly over-estimated).
 * Any over-estimation ends up as additional miner fee, which is safe. Exact fees
 * are recalculated by the SDK during pegin creation.
 *
 * Pegin tx size estimate (155 vBytes):
 *   1 × P2TR input  = P2TR_INPUT_SIZE (58) vBytes
 *   1 × vault output= MAX_NON_LEGACY_OUTPUT_SIZE (43) vBytes
 *   1 × change out  = MAX_NON_LEGACY_OUTPUT_SIZE (43) vBytes
 *   overhead        = TX_BUFFER_SIZE_OVERHEAD (11) vBytes
 *
 * Split tx size estimate (P2TR_INPUT_SIZE + N×43 + 11 vBytes):
 *   N inputs        = N × P2TR_INPUT_SIZE vBytes
 *   M outputs       = M × MAX_NON_LEGACY_OUTPUT_SIZE vBytes  (2 vault + 1 optional change)
 *   overhead        = TX_BUFFER_SIZE_OVERHEAD vBytes
 *
 * We pre-budget for a change output in the split fee even if the final change
 * ends up below the DUST_THRESHOLD (546 sats) it goes to the miner instead.
 *
 * @module services/vault/utxoAllocationService
 */

import type { UTXO } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  createSplitTransaction,
  DUST_THRESHOLD,
  MAX_NON_LEGACY_OUTPUT_SIZE,
  P2TR_INPUT_SIZE,
  TX_BUFFER_SIZE_OVERHEAD,
} from "@babylonlabs-io/ts-sdk/tbv/core";

import { getBTCNetworkForWASM } from "../../config/pegin";
import type {
  AllocationPlan,
  AllocationStrategy,
  SplitTransaction,
  VaultAllocation,
} from "../../types/multiVault";

// ============================================================================
// Constants
// ============================================================================

/**
 * Estimated size of a single P2TR pegin transaction in vBytes.
 *
 * Breakdown:
 *   1 × P2TR input   = P2TR_INPUT_SIZE (58) vBytes
 *   1 × vault output = MAX_NON_LEGACY_OUTPUT_SIZE (43) vBytes
 *   1 × change output= MAX_NON_LEGACY_OUTPUT_SIZE (43) vBytes
 *   overhead         = TX_BUFFER_SIZE_OVERHEAD (11) vBytes
 *   total            = 155 vBytes
 */
const PEGIN_TX_VBYTES =
  P2TR_INPUT_SIZE +
  MAX_NON_LEGACY_OUTPUT_SIZE +
  MAX_NON_LEGACY_OUTPUT_SIZE +
  TX_BUFFER_SIZE_OVERHEAD;

// ============================================================================
// Fee helpers
// ============================================================================

/**
 * Estimate the fee for a pegin transaction.
 *
 * Uses a fixed size of 155 vBytes (1 input, 1 vault output, 1 change output).
 *
 * @param feeRate - Fee rate in sat/vByte
 * @returns Estimated fee in satoshis
 */
function estimatePeginTxFee(feeRate: number): bigint {
  return BigInt(Math.ceil(PEGIN_TX_VBYTES * feeRate));
}

/**
 * Estimate the fee for the split transaction given the actual input and output counts.
 *
 * Unlike the pegin fee estimate (which uses a fixed tx size), the split tx fee
 * must account for the real number of inputs because the SPLIT strategy may
 * consume multiple UTXOs when no single UTXO is large enough.
 *
 * Size breakdown:
 *   numInputs × P2TR_INPUT_SIZE (58) vBytes
 *   numOutputs × MAX_NON_LEGACY_OUTPUT_SIZE (43) vBytes
 *   TX_BUFFER_SIZE_OVERHEAD (11) vBytes
 *
 * @param numInputs  - Number of inputs in the split transaction
 * @param numOutputs - Number of outputs (2 vault outputs + optional change)
 * @param feeRate    - Fee rate in sat/vByte
 * @returns Estimated fee in satoshis
 */
export function estimateSplitTxFee(
  numInputs: number,
  numOutputs: number,
  feeRate: number,
): bigint {
  const txSize =
    numInputs * P2TR_INPUT_SIZE +
    numOutputs * MAX_NON_LEGACY_OUTPUT_SIZE +
    TX_BUFFER_SIZE_OVERHEAD;
  return BigInt(Math.ceil(txSize * feeRate));
}

// ============================================================================
// UTXO selection for split (iterative, input-count-aware)
// ============================================================================

/**
 * Result of iterative split UTXO selection.
 */
interface SplitUtxoSelectionResult {
  selectedUtxos: UTXO[];
  splitFee: bigint;
  change: bigint;
}

/**
 * Select UTXOs for a split transaction using a largest-first, iterative approach.
 *
 * Unlike a simple "accumulate until target" selection, this function recomputes
 * the split transaction fee after each UTXO is added, because every additional
 * input increases the transaction size (58 vBytes per P2TR input) and therefore
 * the required fee. This prevents fee under-estimation when many small UTXOs are
 * needed (e.g. 10 × 0.1 BTC to fund a 0.9 BTC split).
 *
 * We pre-budget for a change output (`numOutputs = 3`) on every iteration.
 * If the final change ends up ≤ dust, the over-estimate goes to the miner.
 *
 * @param availableUtxos    - Pool of available UTXOs
 * @param vaultOutputsTotal - Fixed sum of the two vault outputs (vault amounts + pegin fees)
 * @param feeRate           - Fee rate in sat/vByte
 * @returns Selected UTXOs, the correctly-sized split fee, and the change amount
 * @throws Error if available funds are insufficient
 */
function selectUtxosForSplit(
  availableUtxos: UTXO[],
  vaultOutputsTotal: bigint,
  feeRate: number,
): SplitUtxoSelectionResult {
  const sorted = [...availableUtxos].sort((a, b) => b.value - a.value);
  const selected: UTXO[] = [];
  let accumulated = 0n;

  for (const utxo of sorted) {
    selected.push(utxo);
    accumulated += BigInt(utxo.value);

    // Recompute split fee for the current number of inputs.
    // Pre-budget for 3 outputs (2 vault + 1 change); if change is dust it goes to miner.
    const splitFee = estimateSplitTxFee(selected.length, 3, feeRate);
    const totalNeeded = vaultOutputsTotal + splitFee;

    if (accumulated >= totalNeeded) {
      const change = accumulated - vaultOutputsTotal - splitFee;
      return { selectedUtxos: selected, splitFee, change };
    }
  }

  // Report the shortfall using the fee estimate for all available UTXOs
  const splitFeeForAll = estimateSplitTxFee(selected.length, 3, feeRate);
  const totalNeededForAll = vaultOutputsTotal + splitFeeForAll;
  throw new Error(
    `Insufficient funds: need ${totalNeededForAll} sats ` +
      `(${vaultOutputsTotal} vault outputs + ${splitFeeForAll} split fee), ` +
      `have ${accumulated} sats across ${availableUtxos.length} UTXO(s)`,
  );
}

// ============================================================================
// Strategy planners
// ============================================================================

/**
 * Plan a single-vault allocation.
 *
 * The standard pegin flow handles UTXO selection; we return a trivial plan
 * with no UTXO assignment.
 */
function planSingleAllocation(vaultAmount: bigint): AllocationPlan {
  return {
    needsSplit: false,
    strategy: "SINGLE" as AllocationStrategy,
    vaultAllocations: [
      {
        vaultIndex: 0,
        amount: vaultAmount,
        utxo: null,
        fromSplit: false,
      },
    ],
  };
}

/**
 * Attempt to plan a MULTI_UTXO allocation.
 *
 * Matches the largest UTXO to the largest vault amount and the second-largest
 * UTXO to the second-largest vault amount. Each UTXO must individually cover
 * its vault amount plus an estimated pegin fee; otherwise this function returns
 * `null` and the caller should fall through to the SPLIT strategy.
 *
 * @param availableUtxos - Pool of available UTXOs (must have length >= 2)
 * @param vaultAmounts   - Requested vault amounts (must have length === 2)
 * @param feeRate        - Fee rate in sat/vByte
 * @returns Allocation plan, or `null` if UTXOs are insufficient
 */
function tryPlanMultiUtxoAllocation(
  availableUtxos: UTXO[],
  vaultAmounts: bigint[],
  feeRate: number,
): AllocationPlan | null {
  // Sort UTXOs descending by value
  const sortedUtxos = [...availableUtxos].sort((a, b) => b.value - a.value);

  // Sort vault indices descending by amount (preserving original index for output)
  const sortedVaults = vaultAmounts
    .map((amount, index) => ({ amount, index }))
    .sort((a, b) => Number(b.amount - a.amount));

  const peginFee = estimatePeginTxFee(feeRate);
  const allocations: VaultAllocation[] = [];

  for (let i = 0; i < 2; i++) {
    const vaultInfo = sortedVaults[i];
    const utxo = sortedUtxos[i];

    if (!utxo) {
      return null;
    }

    const utxoValue = BigInt(utxo.value);
    const required = vaultInfo.amount + peginFee;

    if (utxoValue < required) {
      return null;
    }

    allocations.push({
      vaultIndex: vaultInfo.index,
      amount: vaultInfo.amount,
      utxo,
      fromSplit: false,
    });
  }

  // Sort output by vault index for consistent ordering
  allocations.sort((a, b) => a.vaultIndex - b.vaultIndex);

  return {
    needsSplit: false,
    strategy: "MULTI_UTXO" as AllocationStrategy,
    vaultAllocations: allocations,
  };
}

/**
 * Plan a SPLIT allocation.
 *
 * Selects UTXOs (largest-first) sufficient to cover both vault amounts plus
 * estimated fees for the split transaction and both subsequent pegin transactions.
 * Constructs the unsigned split transaction with two vault outputs and an optional
 * change output.
 *
 * Split output sizing:
 *   output[i].amount = vaultAmounts[i] + peginFeePerVault
 *
 * This gives each vault output enough value so that the pegin transaction using
 * that output can pay its own fee. The `VaultAllocation.amount` field records the
 * pure vault amount (what the user requested), not the larger UTXO output size.
 *
 * @param availableUtxos - Pool of available UTXOs
 * @param vaultAmounts   - Requested vault amounts [amount0, amount1] in satoshis
 * @param feeRate        - Fee rate in sat/vByte
 * @param changeAddress  - User's BTC address for change (and for all split outputs)
 * @returns Allocation plan with unsigned split transaction
 * @throws Error if available UTXOs cannot cover the required total
 */
function planSplitAllocation(
  availableUtxos: UTXO[],
  vaultAmounts: bigint[],
  feeRate: number,
  changeAddress: string,
): AllocationPlan {
  // 1. Compute pegin fee buffer per vault output.
  //    Each split output must be large enough for the subsequent pegin tx to pay its fee.
  const peginFeePerVault = estimatePeginTxFee(feeRate);

  // 2. Build the fixed vault outputs (amounts are constant regardless of input count).
  const splitOutputs: Array<{ amount: bigint; address: string; vout: number }> =
    vaultAmounts.map((amount, i) => ({
      amount: amount + peginFeePerVault,
      address: changeAddress,
      vout: i,
    }));

  const vaultOutputsTotal = splitOutputs.reduce((sum, o) => sum + o.amount, 0n);

  // 3. Select UTXOs iteratively, recomputing split tx fee as each input is added.
  //    This correctly accounts for the 58 vBytes/input cost when many small UTXOs
  //    are needed (e.g. 10 × 0.1 BTC funding a 0.9 BTC split).
  const { selectedUtxos, change } = selectUtxosForSplit(
    availableUtxos,
    vaultOutputsTotal,
    feeRate,
  );

  // 4. Append change output if above dust threshold.
  if (change > DUST_THRESHOLD) {
    splitOutputs.push({
      amount: change,
      address: changeAddress,
      vout: splitOutputs.length,
    });
  }

  // 5. Build the unsigned split transaction.
  const network = getBTCNetworkForWASM();
  const splitTxResult = createSplitTransaction(
    selectedUtxos,
    splitOutputs.map((o) => ({ amount: o.amount, address: o.address })),
    network,
  );

  const splitTransaction: SplitTransaction = {
    inputs: selectedUtxos,
    outputs: splitOutputs,
    txHex: splitTxResult.txHex,
    txid: splitTxResult.txid,
  };

  // 6. Build vault allocations.
  // VaultAllocation.amount = pure vault amount (what the user deposited),
  // NOT the split output amount (which is larger by peginFeePerVault).
  const vaultAllocations: VaultAllocation[] = vaultAmounts.map((amount, i) => ({
    vaultIndex: i,
    amount, // pure vault amount
    utxo: null,
    fromSplit: true,
    splitTxOutputIndex: i,
  }));

  return {
    needsSplit: true,
    strategy: "SPLIT" as AllocationStrategy,
    splitTransaction,
    vaultAllocations,
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Plan the optimal UTXO allocation strategy for a multi-vault deposit.
 *
 * Decision tree:
 * ```
 * vaultAmounts.length === 1  →  SINGLE  (trivial, no UTXO assignment)
 * vaultAmounts.length === 2:
 *   availableUtxos.length >= 2 AND each top UTXO covers its vault + pegin fee
 *                              →  MULTI_UTXO  (assign one UTXO per vault)
 *   otherwise                 →  SPLIT  (build split transaction)
 * ```
 *
 * @param availableUtxos - UTXOs available from the user's wallet
 * @param vaultAmounts   - Requested deposit amounts per vault in satoshis.
 *                         Length 1 → single vault; length 2 → two vaults.
 * @param feeRate        - Current fee rate in sat/vByte
 * @param changeAddress  - User's BTC address for change (and split outputs)
 * @returns Complete allocation plan ready for execution
 *
 * @throws Error if `vaultAmounts` is empty or has more than 2 elements
 * @throws Error if `availableUtxos` is empty
 * @throws Error if available funds are insufficient for the requested amounts + fees
 *
 * @example
 * ```typescript
 * // Single vault
 * const plan = planUtxoAllocation(utxos, [50_000_000n], 5, "tb1p...");
 * // plan.strategy === "SINGLE"
 *
 * // Two vaults — split scenario
 * const plan = planUtxoAllocation(utxos, [50_000_000n, 50_000_000n], 5, "tb1p...");
 * // plan.strategy === "SPLIT" or "MULTI_UTXO" depending on available UTXOs
 * ```
 */
export function planUtxoAllocation(
  availableUtxos: UTXO[],
  vaultAmounts: bigint[],
  feeRate: number,
  changeAddress: string,
): AllocationPlan {
  // --- Input validation ---

  if (vaultAmounts.length === 0) {
    throw new Error("vaultAmounts must not be empty");
  }

  if (vaultAmounts.length > 2) {
    throw new Error(
      `Only 1 or 2 vaults are supported; received ${vaultAmounts.length}`,
    );
  }

  if (availableUtxos.length === 0) {
    throw new Error("No UTXOs available for deposit");
  }

  // --- Single vault (SINGLE strategy) ---

  if (vaultAmounts.length === 1) {
    return planSingleAllocation(vaultAmounts[0]);
  }

  // --- Two-vault path ---

  const [amount0, amount1] = vaultAmounts as [bigint, bigint];

  // Try MULTI_UTXO first if we have at least 2 UTXOs
  if (availableUtxos.length >= 2) {
    const multiPlan = tryPlanMultiUtxoAllocation(
      availableUtxos,
      [amount0, amount1],
      feeRate,
    );
    if (multiPlan !== null) {
      return multiPlan;
    }
  }

  // SPLIT strategy
  return planSplitAllocation(
    availableUtxos,
    [amount0, amount1],
    feeRate,
    changeAddress,
  );
}
