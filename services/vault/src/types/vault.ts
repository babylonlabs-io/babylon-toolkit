/**
 * Vault type definitions
 *
 * Vault represents a BTC deposit that can be used as collateral.
 * Data is fetched from the vault indexer via GraphQL.
 */

import type { Address, Hex } from "viem";

import {
  ContractStatus,
  type PeginDisplayLabel,
} from "../models/peginStateMachine";

// Re-export ContractStatus as VaultStatus for clarity in vault-related code
export { ContractStatus as VaultStatus };

/**
 * Vault - represents a BTC deposit on-chain
 *
 * A vault locks BTC and enables using it as collateral in DeFi applications.
 */
export interface Vault {
  // === Identity ===

  /** Vault ID (same as pegin transaction hash) */
  id: Hex;

  // === Core vault data ===

  /** Depositor's Ethereum address */
  depositor: Address;

  /** Depositor's BTC public key (x-only, 32 bytes) */
  depositorBtcPubkey: Hex;

  /** Unsigned BTC transaction hex */
  unsignedBtcTx: Hex;

  /** Amount in satoshis */
  amount: bigint;

  /** Vault provider's Ethereum address */
  vaultProvider: Address;

  /** Vault status (0=Pending, 1=Verified, 2=Active, 3=Redeemed) */
  status: ContractStatus;

  /** Application controller address (immutable, set at creation) */
  applicationController: Address;

  // === Version fields (locked at vault creation for payout signing) ===

  /** Version of vault keepers when vault was created */
  appVaultKeepersVersion: number;

  /** Version of universal challengers when vault was created */
  universalChallengersVersion: number;

  // === Timestamps ===

  /** Timestamp when vault was created (pendingAt from indexer) */
  createdAt: number;

  // === Application/usage status ===

  /** Whether vault is currently in use as collateral */
  isInUse: boolean;
}

/**
 * VaultData - aggregate vault statistics for display
 */
export interface VaultData {
  supplyTVL: number;
  borrowTVL: number;
  protocolLTV: number;
  btc: number;
}

/**
 * Deposit - simplified deposit representation for display
 */
export interface Deposit {
  id: string;
  amount: number;
  pegInTxHash: string;
  status: PeginDisplayLabel;
  /** Application name (e.g., "Aave") */
  appName?: string;
  /** Timestamp in milliseconds since epoch */
  timestamp?: number;
  // Multi-vault / UTXO split fields
  /** Batch ID if this vault is part of a multi-vault batch */
  batchId?: string;
  /** Split transaction ID if this vault was created from a split UTXO */
  splitTxId?: string;
  /** Position in batch (1-based, e.g., 1 for first vault in batch of 2) */
  batchIndex?: number;
  /** Total number of vaults in this batch */
  batchTotal?: number;
}
