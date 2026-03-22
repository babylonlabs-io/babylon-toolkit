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
  /** Step 2: Sign and submit peg-in request in ETH wallet */
  SUBMIT_PEGIN = 2,
  /** Step 3: Sign payout transactions in BTC wallet */
  SIGN_PAYOUTS = 3,
  /** Step 4: Download vault artifacts */
  ARTIFACT_DOWNLOAD = 4,
  /** Step 5: Sign and broadcast BTC transaction */
  BROADCAST_BTC = 5,
  /** Step 6: Deposit completed */
  COMPLETED = 6,
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
  /**
   * CSV timelock in blocks for the Pre-PegIn HTLC refund path.
   * TODO: fetch from ProtocolParams contract once btc-vault adds this parameter.
   */
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
  /** PegIn tx hex — used to compute the vault ID on-chain */
  peginTxHex: string;
  vaultProviderAddress: string;
  onPopSigned?: () => void;
  /** Depositor's BTC payout address (e.g. bc1p...) */
  depositorPayoutBtcAddress: string;
  /** Keccak256 hash of the depositor's Lamport public key */
  depositorLamportPkHash: Hex;
  /** Pre-signed BTC PoP signature to reuse (skips BTC wallet signing) */
  preSignedBtcPopSignature?: Hex;
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
  providerUrl: string;
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
  providerUrl: string;
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
  vaultProviderUrl: string;
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
}

// ============================================================================
// Flow Result
// ============================================================================

/** Result returned on successful deposit flow completion */
export interface DepositFlowResult {
  btcTxid: string;
  ethTxHash: string;
  depositorBtcPubkey: string;
  transactionData: {
    unsignedTxHex: string;
    selectedUTXOs: DepositUtxo[];
    fee: bigint;
  };
}
