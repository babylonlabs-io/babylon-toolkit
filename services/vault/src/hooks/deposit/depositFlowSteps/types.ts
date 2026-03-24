/**
 * Type definitions for deposit flow steps
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { Address, Hex, WalletClient } from "viem";

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

export interface PeginPrepareParams {
  btcWalletProvider: BitcoinWallet;
  walletClient: WalletClient;
  amount: bigint;
  feeRate: number;
  btcAddress: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  /** CSV timelock in blocks for the PegIn vault output */
  timelockPegin: number;
  /** CSV timelock in blocks for the Pre-PegIn HTLC refund path (tRefund from VersionedOffchainParams) */
  timelockRefund: number;
  /** SHA256 hash commitment for the HTLC (64 hex chars = 32 bytes) */
  hashH: string;
  /** Number of local challengers (vault keepers) */
  numLocalChallengers: number;
  /** M in M-of-N council multisig */
  councilQuorum: number;
  /** N in M-of-N council multisig */
  councilSize: number;
  confirmedUTXOs: DepositUtxo[];
  reservedUtxoRefs: UtxoRef[];
}

export interface PeginPrepareResult {
  /** Vault ID: hash of the pegin tx (NOT the pre-pegin tx) */
  btcTxid: Hex;
  depositorBtcPubkey: string;
  /** Funded Pre-PegIn tx hex — this is the tx the depositor signs and broadcasts */
  fundedPrePeginTxHex: string;
  /** PegIn tx hex — passed to registerPeginOnChain for vault ID computation */
  peginTxHex: string;
  /** Depositor's Schnorr signature over PegIn input 0 (HTLC leaf 0), 128 hex chars */
  peginInputSignature: string;
  selectedUTXOs: DepositUtxo[];
  fee: bigint;
}

export interface PeginRegisterParams {
  btcWalletProvider: BitcoinWallet;
  walletClient: WalletClient;
  depositorBtcPubkey: string;
  /** PegIn tx hex — submitted as depositorSignedPeginTx; vault ID derived from this */
  peginTxHex: string;
  /** Funded Pre-PegIn tx hex — submitted as unsignedPrePeginTx for DA */
  fundedPrePeginTxHex: string;
  /** SHA256 hashlock for atomic swap activation (hex with 0x prefix) */
  hashlock: Hex;
  vaultProviderAddress: string;
  onPopSigned?: () => void;
  /** Depositor's BTC payout address (e.g. bc1p...) */
  depositorPayoutBtcAddress: string;
  /** Keccak256 hash of the depositor's Lamport public key */
  depositorLamportPkHash: Hex;
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

export interface SavePendingPeginParams {
  depositorEthAddress: Address;
  btcTxid: string;
  ethTxHash: string;
  amount: bigint;
  selectedProviders: string[];
  applicationController: string;
  unsignedTxHex: string;
  selectedUTXOs: DepositUtxo[];
}

// ============================================================================
// Step 2.5: Lamport Key Submission
// ============================================================================

export interface LamportSubmissionParams {
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
  /** CSV timelock in blocks for the PegIn output */
  timelockPegin: number;
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

// ============================================================================
// Flow Result
// ============================================================================

/** Result returned on successful deposit flow completion */
export interface DepositFlowResult {
  btcTxid: string;
  ethTxHash: string;
  depositorBtcPubkey: string;
  /** HTLC secret hex (no 0x prefix) — shown to the user for safekeeping */
  htlcSecretHex: string;
  transactionData: {
    unsignedTxHex: string;
    selectedUTXOs: DepositUtxo[];
    fee: bigint;
  };
}
