/**
 * Type definitions for deposit flow steps
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { Hex, WalletClient } from "viem";

import type { DepositorGraphTransactions } from "@/clients/vault-provider-rpc/types";
import type {
  PreparedTransaction,
  SigningContext,
} from "@/services/vault/vaultPayoutSignatureService";

// ============================================================================
// Deposit Flow Steps
// ============================================================================

/**
 * Deposit flow step numbers.
 *
 * Numeric values enable ordered comparisons (e.g. `currentStep >= SIGN_PAYOUTS`).
 */
export enum DepositFlowStep {
  /** Step 0: Sign and broadcast split transaction (multi-vault SPLIT strategy only) */
  SIGN_SPLIT_TX = 0,
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
// Steps 1-2: Pegin Submit
// ============================================================================

export interface PeginRegisterParams {
  btcWalletProvider: BitcoinWallet;
  walletClient: WalletClient;
  depositorBtcPubkey: string;
  /** PegIn tx hex — submitted as depositorSignedPeginTx; vault ID derived from this */
  peginTxHex: string;
  /** Pre-PegIn tx hex — submitted as unsignedPrePeginTx for DA */
  unsignedPrePeginTxHex: string;
  /** SHA256 hashlock for HTLC activation (hex with 0x prefix) */
  hashlock: Hex;
  /** Zero-based index of the HTLC output in the Pre-PegIn tx this PegIn spends */
  htlcVout: number;
  vaultProviderAddress: string;
  onPopSigned?: () => void;
  /** Depositor's BTC payout address (e.g. bc1p...) */
  depositorPayoutBtcAddress: string;
  /** Keccak256 hash of the depositor's WOTS public key */
  depositorWotsPkHash: Hex;
  /** Pre-signed BTC PoP signature to reuse (skips BTC wallet signing) */
  preSignedBtcPopSignature?: Hex;
  /** SHA-256 hash of the depositor's secret for the new peg-in flow */
  depositorSecretHash?: Hex;
}

export interface PeginRegisterResult {
  btcTxid: string;
  ethTxHash: Hex;
  /** The BTC PoP signature used, for reuse in subsequent pegins */
  btcPopSignature: Hex;
}

// ============================================================================
// Step 2.5: WOTS Key Submission
// ============================================================================

export interface WotsSubmissionParams {
  btcTxid: string;
  depositorBtcPubkey: string;
  appContractAddress: string;
  providerAddress: string;
  getMnemonic: () => Promise<string>;
  signal?: AbortSignal;
}

// ============================================================================
// Step 3: Payout Signing
// ============================================================================

export interface PayoutSigningParams {
  btcTxid: string;
  /** The pegin transaction hex from step 2 - used for signing context */
  btcTxHex: string;
  depositorBtcPubkey: string;
  providerAddress: string;
  providerBtcPubKey: string;
  vaultKeepers: Array<{ btcPubKey: string }>;
  universalChallengers: Array<{ btcPubKey: string }>;
  /** Depositor's registered payout address (scriptPubKey hex) from the indexer */
  depositorPayoutBtcAddress: string;
  /** Optional AbortSignal for cancellation */
  signal?: AbortSignal;
}

export interface PayoutSigningContext {
  context: SigningContext;
  vaultProviderAddress: string;
  preparedTransactions: PreparedTransaction[];
  depositorGraph: DepositorGraphTransactions;
}

// ============================================================================
// Step 4: Broadcast
// ============================================================================

export interface BroadcastParams {
  btcTxid: string;
  depositorBtcPubkey: string;
  btcWalletProvider: BitcoinWallet;
  /** Funded Pre-PegIn tx hex to broadcast (avoids re-fetching from indexer) */
  fundedPrePeginTxHex: string;
}
