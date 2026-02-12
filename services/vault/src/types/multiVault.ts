/**
 * Multi-Vault POC Type Definitions
 *
 * Types for UTXO splitting and batch vault creation.
 */

import type { UTXO } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Hex } from "viem";

/**
 * Allocation for a single vault
 */
export interface VaultAllocation {
  /** Vault index (0-based) */
  vaultIndex: number;
  /** Amount for this vault in satoshis */
  amount: bigint;
  /** UTXO to use (null if from split transaction) */
  utxo: UTXO | null;
  /** Whether this vault uses output from split transaction */
  fromSplit: boolean;
  /** Output index in split transaction (if fromSplit=true) */
  splitTxOutputIndex?: number;
}

/**
 * Split transaction details
 */
export interface SplitTransaction {
  /** Input UTXOs being split */
  inputs: UTXO[];
  /** Output amounts for each vault */
  outputs: Array<{ amount: bigint; address: string; vout: number }>;
  /** Unsigned transaction hex */
  txHex: string;
  /** Transaction ID (calculated deterministically) */
  txid: string;
  /** Signed transaction hex (after signing) */
  signedHex?: string;
  /** Whether transaction has been broadcasted */
  broadcasted?: boolean;
}

/**
 * Complete allocation plan for multiple vaults
 */
export interface AllocationPlan {
  /** Whether UTXO split is needed */
  needsSplit: boolean;
  /** Split transaction details (if needed) */
  splitTransaction?: SplitTransaction;
  /** Allocation for each vault */
  vaultAllocations: VaultAllocation[];
}

/**
 * Result of a single peg-in creation
 */
export interface PeginCreationResult {
  /** Vault index in the batch */
  vaultIndex: number;
  /** Bitcoin transaction hash (unsigned tx hash from prepare step) */
  btcTxHash: Hex;
  /** Ethereum transaction hash (from submitPeginRequest) */
  ethTxHash: Hex;
  /** Vault ID from contract (BTC tx hash with 0x - PRIMARY IDENTIFIER for vault provider queries) */
  vaultId: Hex;
  /** Unsigned BTC transaction hex */
  btcTxHex: string;
  /** Selected UTXOs for this peg-in */
  selectedUTXOs: UTXO[];
  /** Transaction fee */
  fee: bigint;
  /** Depositor's BTC public key */
  depositorBtcPubkey: string;
  /** Error if peg-in creation failed */
  error?: string;
}

/**
 * Multi-vault deposit result
 */
export interface MultiVaultDepositResult {
  /** Batch ID for grouping related vaults */
  batchId: string;
  /** Split transaction (if used) */
  splitTransaction?: SplitTransaction;
  /** Results for each vault */
  vaults: PeginCreationResult[];
  /** Timestamp when batch was created */
  createdAt: number;
}

/**
 * Pending peg-in batch metadata for localStorage
 */
export interface PendingPeginBatch {
  /** Unique batch identifier */
  batchId: string;
  /** Array of vault IDs (btcTxHashes) */
  vaultIds: string[];
  /** Split transaction ID (if used) */
  splitTxId?: string;
  /** Total amount across all vaults */
  totalAmount: string;
  /** Number of vaults in batch */
  numVaults: number;
  /** Timestamp when batch was created */
  createdAt: number;
}

/**
 * Allocation strategy type
 */
export type AllocationStrategy = "SPLIT" | "MULTI_UTXO" | "SINGLE";

/**
 * Vault configuration in form
 */
export interface VaultConfig {
  /** Vault index */
  index: number;
  /** Amount in BTC (string for form input) */
  amountBtc: string;
  /** Amount in satoshis */
  amountSats: bigint;
}
