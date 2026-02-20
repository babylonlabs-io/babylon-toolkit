/**
 * UTXO Allocation Service for multi-vault deposits.
 *
 * Determines the optimal strategy for allocating UTXOs across one or two vaults:
 *
 * - SINGLE:      1 vault → trivial plan; standard pegin flow selects its own UTXOs.
 * - MULTI_INPUT: 2 vaults → partition available UTXOs so each vault's assigned set
 *                independently covers its amount + pegin fee. No extra on-chain tx.
 *                Preferred because it avoids the split tx sign-and-broadcast step.
 * - SPLIT:       2 vaults, UTXOs cannot be partitioned (e.g. only 1 UTXO) → create
 *                a Bitcoin split transaction that fans UTXOs into two vault-sized
 *                outputs, then each vault's pegin uses exactly 1 split output.
 *
 * Fee philosophy
 * --------------
 * All fee estimates are intentionally conservative (slightly over-estimated).
 * Any over-estimation ends up as additional miner fee, which is safe. Exact fees
 * are recalculated by the SDK during pegin creation.
 *
 * Pegin tx size (scales with input count):
 *   N × P2TR_INPUT_SIZE (58) vBytes   (N inputs)
 *   1 × MAX_NON_LEGACY_OUTPUT_SIZE (43) vBytes  (vault output)
 *   1 × MAX_NON_LEGACY_OUTPUT_SIZE (43) vBytes  (change output)
 *   TX_BUFFER_SIZE_OVERHEAD (11) vBytes
 *   → 1-input pegin = 155 vBytes; each additional input adds 58 vBytes
 *
 * Split tx size (scales with input count):
 *   N inputs  = N × P2TR_INPUT_SIZE vBytes
 *   M outputs = M × MAX_NON_LEGACY_OUTPUT_SIZE vBytes  (2 vault + 1 optional change)
 *   overhead  = TX_BUFFER_SIZE_OVERHEAD vBytes
 *
 * We pre-budget for a change output in both pegin and split fees. If the final
 * change ends up below DUST_THRESHOLD (546 sats), the over-estimate goes to the
 * miner instead.
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

import { getBTCNetworkForWASM } from "../../../config/pegin";

import type {
  AllocationPlan,
  SplitTransaction,
  VaultAllocation,
} from "./types";

// ============================================================================
// Fee helpers
// ============================================================================

/**
 * Estimate the pegin transaction fee for UTXO allocation planning purposes only.
 *
 * **This function must not be used for actual pegin fee calculation.** It is an
 * internal allocation helper used to:
 *   1. Determine whether a growing set of UTXOs is sufficient to fund a vault's
 *      pegin in the MULTI_INPUT strategy (`selectUtxosForVault`).
 *   2. Size each split transaction output to carry a 1-input pegin fee buffer
 *      in the SPLIT strategy (`planSplitAllocation`).
 *
 * The actual pegin fee is recomputed precisely by the SDK during pegin creation.
 * Any over-estimation here becomes additional miner fee, which is safe.
 *
 * Size breakdown (conservative, pre-budgets for change output):
 *   numInputs × P2TR_INPUT_SIZE (58) vBytes
 *   1 × MAX_NON_LEGACY_OUTPUT_SIZE (43) vBytes  (vault output)
 *   1 × MAX_NON_LEGACY_OUTPUT_SIZE (43) vBytes  (change output, pre-budgeted)
 *   TX_BUFFER_SIZE_OVERHEAD (11) vBytes
 *   → 1 input = 155 vBytes; each additional input adds 58 vBytes
 *
 * @param numInputs - Number of P2TR inputs in the pegin transaction
 * @param feeRate   - Fee rate in sat/vByte
 * @returns Conservative fee estimate in satoshis (for allocation planning only)
 */
function estimatePeginFeeForAllocation(
  numInputs: number,
  feeRate: number,
): bigint {
  const txSize =
    numInputs * P2TR_INPUT_SIZE +
    MAX_NON_LEGACY_OUTPUT_SIZE + // vault output
    MAX_NON_LEGACY_OUTPUT_SIZE + // change output (pre-budgeted)
    TX_BUFFER_SIZE_OVERHEAD;
  return BigInt(Math.ceil(txSize * feeRate));
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
// UTXO selection helpers (iterative, input-count-aware)
// ============================================================================

/**
 * Result of iterative UTXO selection for one vault in the MULTI_INPUT strategy.
 */
interface VaultUtxoSelectionResult {
  selectedUtxos: UTXO[];
  peginFee: bigint;
}

/**
 * Select UTXOs from a pool for a single vault using a largest-first, iterative approach.
 *
 * Recomputes the pegin fee after each UTXO is added, because every additional
 * input increases the transaction size (58 vBytes per P2TR input). This prevents
 * fee under-estimation when many small UTXOs are needed.
 *
 * @param pool        - Ordered pool of UTXOs to draw from (modified: selected UTXOs are removed)
 * @param vaultAmount - Requested vault deposit amount in satoshis
 * @param feeRate     - Fee rate in sat/vByte
 * @returns Selected UTXOs and the correctly-sized pegin fee, or `null` if pool is insufficient
 */
function selectUtxosForVault(
  pool: UTXO[],
  vaultAmount: bigint,
  feeRate: number,
): VaultUtxoSelectionResult | null {
  const selected: UTXO[] = [];
  let accumulated = 0n;

  for (let i = 0; i < pool.length; i++) {
    const utxo = pool[i]!;
    selected.push(utxo);
    accumulated += BigInt(utxo.value);

    const peginFee = estimatePeginFeeForAllocation(selected.length, feeRate);
    if (accumulated >= vaultAmount + peginFee) {
      // Remove selected UTXOs from pool (in-place splice)
      pool.splice(0, selected.length);
      return { selectedUtxos: selected, peginFee };
    }
  }

  return null; // pool exhausted before accumulating enough
}

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
    strategy: "SINGLE",
    vaultAllocations: [
      {
        vaultIndex: 0,
        amount: vaultAmount,
        utxos: [],
        fromSplit: false,
      },
    ],
  };
}

/**
 * Attempt to plan a MULTI_INPUT allocation.
 *
 * Partitions the available UTXOs into two sets — one per vault — using a
 * largest-first greedy approach:
 *   1. Sort UTXOs largest-first.
 *   2. Assign the larger vault first: accumulate UTXOs until that vault's
 *      amount + estimated pegin fee is covered.
 *   3. Assign the smaller vault from the remaining UTXOs.
 *   4. If either vault cannot be satisfied → return `null` (fall through to SPLIT).
 *
 * Unlike the old MULTI_UTXO strategy (which required each vault to be funded by
 * exactly one UTXO), MULTI_INPUT allows multiple UTXOs per vault. This avoids
 * unnecessary split transactions — e.g. 10 × 0.1 BTC for two 0.45 BTC vaults
 * uses MULTI_INPUT (5 UTXOs per vault) instead of creating a split tx.
 *
 * @param availableUtxos - Pool of available UTXOs (must have length >= 2)
 * @param vaultAmounts   - Requested vault amounts (must have length === 2)
 * @param feeRate        - Fee rate in sat/vByte
 * @returns Allocation plan, or `null` if UTXOs cannot be partitioned
 */
function tryPlanMultiInputAllocation(
  availableUtxos: UTXO[],
  vaultAmounts: bigint[],
  feeRate: number,
): AllocationPlan | null {
  // Sort UTXOs descending by value so largest-first selection works correctly
  const sortedPool = [...availableUtxos].sort((a, b) => b.value - a.value);

  // Sort vault indices descending by amount — larger vault gets first pick of UTXOs
  const sortedVaults = vaultAmounts
    .map((amount, index) => ({ amount, index }))
    .sort((a, b) => Number(b.amount - a.amount));

  // Assign UTXOs to vault 0 (larger vault) from the pool
  const vault0 = sortedVaults[0]!;
  const result0 = selectUtxosForVault(sortedPool, vault0.amount, feeRate);
  if (result0 === null) return null;

  // Assign UTXOs to vault 1 (smaller vault) from whatever remains
  const vault1 = sortedVaults[1]!;
  const result1 = selectUtxosForVault(sortedPool, vault1.amount, feeRate);
  if (result1 === null) return null;

  // Build allocations indexed by original vault index
  const allocationMap = new Map<number, VaultAllocation>([
    [
      vault0.index,
      {
        vaultIndex: vault0.index,
        amount: vault0.amount,
        utxos: result0.selectedUtxos,
        fromSplit: false,
      },
    ],
    [
      vault1.index,
      {
        vaultIndex: vault1.index,
        amount: vault1.amount,
        utxos: result1.selectedUtxos,
        fromSplit: false,
      },
    ],
  ]);

  // Sort by vaultIndex ascending for consistent ordering
  const allocations = [allocationMap.get(0)!, allocationMap.get(1)!];

  return {
    needsSplit: false,
    strategy: "MULTI_INPUT",
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
  //    Each split output funds a pegin tx that uses exactly 1 input (the split output itself),
  //    so we use estimatePeginFeeForAllocation(1, feeRate) — not the variable-input version.
  const peginFeePerVault = estimatePeginFeeForAllocation(1, feeRate);

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
  // utxos is empty because the pegin uses the split tx output, not a wallet UTXO.
  const vaultAllocations: VaultAllocation[] = vaultAmounts.map((amount, i) => ({
    vaultIndex: i,
    amount, // pure vault amount
    utxos: [],
    fromSplit: true,
    splitTxOutputIndex: i,
  }));

  return {
    needsSplit: true,
    strategy: "SPLIT",
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
 * vaultAmounts.length === 1  →  SINGLE     (trivial, no UTXO assignment)
 * vaultAmounts.length === 2:
 *   UTXOs can be partitioned: vault 0 set + vault 1 set each self-sufficient
 *                              →  MULTI_INPUT  (assign UTXOs per vault, no split tx)
 *   UTXOs cannot be partitioned (e.g. only 1 UTXO, or combined only covers one vault)
 *                              →  SPLIT  (build split transaction, then 1-input pegins)
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
 * // Two vaults — MULTI_INPUT when UTXOs can be partitioned
 * const plan = planUtxoAllocation(utxos, [50_000_000n, 50_000_000n], 5, "tb1p...");
 * // plan.strategy === "MULTI_INPUT" or "SPLIT" depending on available UTXOs
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

  // Try MULTI_INPUT first (requires at least 2 UTXOs to partition between vaults)
  if (availableUtxos.length >= 2) {
    const multiPlan = tryPlanMultiInputAllocation(
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
