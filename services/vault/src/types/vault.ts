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

  /** Vault status (0=Pending, 1=Verified, 2=Active, 3=Redeemed, 4=Liquidated, 5=Invalid, 6=DepositorWithdrawn, 7=Expired) */
  status: ContractStatus;

  /** Application controller address (immutable, set at creation) */
  applicationController: Address;

  // === Version fields (locked at vault creation for payout signing) ===

  /** Version of vault keepers when vault was created */
  appVaultKeepersVersion: number;

  /** Version of universal challengers when vault was created */
  universalChallengersVersion: number;

  /** Version of offchain params (timing, security council) when vault was created */
  offchainParamsVersion: number;

  // === Timestamps ===

  /** Timestamp when vault was created (pendingAt from indexer) */
  createdAt: number;

  /** Timestamp when vault expired (null if not expired), milliseconds */
  expiredAt?: number;

  /** Expiration reason: "ack_timeout" or "proof_timeout" (null if not expired) */
  expirationReason?: string;

  // === Ownership ===

  /** Current vault owner (changes during liquidation/escrow, null if not yet set) */
  currentOwner?: Address;

  /** Referral attribution code (0 = no referral) */
  referralCode: number;

  // === Application/usage status ===

  /** Whether vault is currently in use as collateral */
  isInUse: boolean;
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
  // Multi-vault tracking fields
  /** UUID for grouping related deposits (multi-vault deposits) */
  batchId?: string;
  /** Split transaction hash reference (only for SPLIT strategy) */
  splitTxId?: string;
  /** Position in batch (1 or 2 for 2-vault deposits, 1-indexed for display) */
  batchIndex?: number;
  /** Total vaults in batch (2 for multi-vault deposits) */
  batchTotal?: number;
}
