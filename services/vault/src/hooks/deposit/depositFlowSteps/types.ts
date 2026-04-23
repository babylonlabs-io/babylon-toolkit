/**
 * Type definitions for deposit flow steps
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { PopSignature } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Hex, WalletClient } from "viem";

import type { WotsPublicKeys } from "@/services/wots";

// ============================================================================
// Deposit Flow Steps
// ============================================================================

/**
 * Deposit flow step numbers.
 *
 * Numeric values enable ordered comparisons (e.g. `currentStep >= SIGN_PAYOUTS`).
 */
export enum DepositFlowStep {
  /** Step 1: Sign proof of possession in BTC wallet */
  SIGN_POP = 1,
  /** Step 2: Submit peg-in to Ethereum (registers vault on-chain) */
  SUBMIT_PEGIN = 2,
  /** Step 3: Sign and broadcast Pre-PegIn transaction to Bitcoin */
  BROADCAST_PRE_PEGIN = 3,
  /** Step 4: Sign payout transactions in BTC wallet */
  SIGN_PAYOUTS = 4,
  /** Step 5: Download vault artifacts */
  ARTIFACT_DOWNLOAD = 5,
  /** Step 6: Reveal HTLC secret on Ethereum to activate the vault */
  ACTIVATE_VAULT = 6,
  /** Step 7: Deposit completed */
  COMPLETED = 7,
}

// ============================================================================
// Shared Types
// ============================================================================

/** UTXO representation used throughout the deposit flow */
export interface DepositUtxo {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: string;
}

/** Minimal UTXO reference for reservation tracking */
export interface UtxoRef {
  txid: string;
  vout: number;
}

// ============================================================================
// DepositFlowStep.SIGN_POP + SUBMIT_PEGIN — shared params for PoP signing
// and the batch ETH tx (both operations reuse the same PopSignature and
// Pre-PegIn tx, so the fields live on the batch params, not per-request).
// ============================================================================

export interface PeginBatchRegisterParams {
  btcWalletProvider: BitcoinWallet;
  walletClient: WalletClient;
  /** Vault provider ETH address (shared for all vaults in batch) */
  vaultProviderAddress: string;
  /** Shared Pre-PegIn tx hex for the whole batch */
  unsignedPrePeginTx: string;
  /** Per-vault registration data */
  requests: Array<{
    depositorSignedPeginTx: string;
    hashlock: Hex;
    htlcVout: number;
    depositorPayoutBtcAddress: string;
    depositorWotsPkHash: Hex;
  }>;
  /** Proof of possession from signProofOfPossession. */
  popSignature: PopSignature;
}

export interface PeginBatchRegisterResult {
  ethTxHash: Hex;
  vaults: Array<{
    vaultId: Hex;
    peginTxHash: Hex;
  }>;
}

// ============================================================================
// Step 2.5: WOTS Key Submission
// ============================================================================

export interface WotsSubmissionParams {
  /** Raw BTC pegin transaction hash (for VP RPC pegin_txid) */
  peginTxHash: string;
  depositorBtcPubkey: string;
  providerAddress: string;
  /** Pre-derived WOTS block public keys (one per assert block) */
  wotsPublicKeys: WotsPublicKeys;
  signal?: AbortSignal;
}

// ============================================================================
// Step 3: Broadcast
// ============================================================================

export interface BroadcastParams {
  /** Derived vault ID (for localStorage identity) */
  vaultId: string;
  depositorBtcPubkey: string;
  btcWalletProvider: BitcoinWallet;
  /** Funded Pre-PegIn tx hex to broadcast (avoids re-fetching from indexer) */
  fundedPrePeginTxHex: string;
  /**
   * Trusted UTXO data from transaction construction phase.
   * Key format: "txid:vout". When provided, skips untrusted mempool API queries.
   */
  expectedUtxos?: Record<string, { scriptPubKey: string; value: number }>;
}
