/**
 * Multi-vault type definitions.
 *
 * Shared types for the 2-vault deposit flow, including allocation strategies,
 * split transaction details, and per-vault allocation plans.
 */

import type { UTXO } from "@babylonlabs-io/ts-sdk/tbv/core";

/**
 * Allocation strategy chosen by the UTXO allocation service.
 *
 * - SINGLE:      Single-vault deposit; standard flow handles UTXO selection.
 * - MULTI_INPUT: Two vaults, each funded by one or more existing UTXOs assigned
 *                directly (no split transaction needed). Preferred over SPLIT because
 *                it avoids the extra sign-and-broadcast step and associated fees.
 * - SPLIT:       Two vaults, funded by first creating a Bitcoin split transaction
 *                because the available UTXOs cannot be partitioned to independently
 *                fund each vault (e.g. only 1 UTXO available, or combined UTXOs only
 *                cover one vault at a time).
 */
export type AllocationStrategy = "SINGLE" | "MULTI_INPUT" | "SPLIT";

/**
 * Allocation plan for a single vault within a multi-vault deposit.
 */
export interface VaultAllocation {
  /** 0-based vault index (0 or 1 for the 2-vault flow). */
  vaultIndex: number;

  /**
   * Amount to deposit into this vault, in satoshis.
   *
   * This is the **pure vault amount** as requested by the user (e.g. 50 000 000 sats
   * for a 50/50 split of 1 BTC). It does NOT include any fee buffers — those are
   * accounted for at the UTXO level in the split transaction output.
   */
  amount: bigint;

  /**
   * UTXOs assigned to this vault's pegin transaction.
   *
   * - SINGLE strategy:      empty `[]` (standard flow selects its own UTXOs).
   * - MULTI_INPUT strategy: one or more UTXOs whose combined value covers this
   *                         vault's amount plus the estimated pegin fee.
   * - SPLIT strategy:       empty `[]` (the pegin uses the split tx output instead).
   */
  utxos: UTXO[];

  /** Whether this vault's pegin is funded from a split transaction output. */
  fromSplit: boolean;

  /**
   * Output index within the split transaction that funds this vault.
   * Only set when `fromSplit === true`.
   */
  splitTxOutputIndex?: number;
}

/**
 * Details of the Bitcoin split transaction used in the SPLIT strategy.
 *
 * The split transaction takes one or more input UTXOs and creates two outputs —
 * one for each vault — plus an optional change output. Each vault output carries
 * the vault amount plus a 1-input pegin fee buffer, because each split output is
 * sized to be used as a single input in its subsequent pegin transaction.
 */
export interface SplitTransaction {
  /** Input UTXOs consumed by the split transaction. */
  inputs: UTXO[];

  /**
   * Outputs of the split transaction.
   *
   * Indices 0 and 1 correspond to vault 0 and vault 1 respectively.
   * Index 2 (if present) is the change output returned to the user's address.
   */
  outputs: Array<{
    /** Amount in satoshis (vault amount + pegin fee buffer for vault outputs). */
    amount: bigint;
    /** Destination Bitcoin address. */
    address: string;
    /** Output index within the split transaction. */
    vout: number;
  }>;

  /** Unsigned split transaction hex (ready for PSBT creation). */
  txHex: string;

  /**
   * Deterministic transaction ID calculated from the unsigned transaction.
   * Remains stable after signing (no segwit txid malleability for P2TR).
   */
  txid: string;

  /** Signed transaction hex — populated after wallet signing in Issue 4. */
  signedHex?: string;

  /** Whether the split transaction has been broadcast to the Bitcoin network. */
  broadcasted?: boolean;
}

/**
 * Complete UTXO allocation plan produced by `planUtxoAllocation()`.
 *
 * Describes which strategy to use and, for the SPLIT strategy, includes the
 * fully-constructed (unsigned) split transaction ready for signing.
 */
export interface AllocationPlan {
  /** Whether a split transaction must be signed and broadcast before pegin creation. */
  needsSplit: boolean;

  /** Allocation strategy that was selected. */
  strategy: AllocationStrategy;

  /**
   * Split transaction details.
   * Only present when `strategy === "SPLIT"`.
   */
  splitTransaction?: SplitTransaction;

  /**
   * Per-vault allocation details, sorted by `vaultIndex` ascending.
   * Length matches `vaultAmounts.length` passed to `planUtxoAllocation()`.
   */
  vaultAllocations: VaultAllocation[];
}
