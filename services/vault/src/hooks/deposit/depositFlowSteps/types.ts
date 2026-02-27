/**
 * Type definitions for deposit flow steps
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { Address, Hex, WalletClient } from "viem";

import type {
  PreparedTransaction,
  SigningContext,
} from "@/services/vault/vaultPayoutSignatureService";

// ============================================================================
// Deposit Flow Steps
// ============================================================================

/**
 * Deposit flow step numbers
 */
export enum DepositStep {
  /** Step 1: Sign proof of possession in BTC wallet */
  SIGN_POP = "SIGN_POP",
  /** Step 2: Sign and submit peg-in request in ETH wallet */
  SUBMIT_PEGIN = "SUBMIT_PEGIN",
  /** Step 3: Sign payout transactions in BTC wallet */
  SIGN_PAYOUTS = "SIGN_PAYOUTS",
  /** Step 4: Download vault artifacts */
  ARTIFACT_DOWNLOAD = "ARTIFACT_DOWNLOAD",
  /** Step 5: Sign and broadcast BTC transaction */
  BROADCAST_BTC = "BROADCAST_BTC",
  /** Step 6: Deposit completed */
  COMPLETED = "COMPLETED",
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
  /** CSV timelock in blocks for the PegIn output */
  timelockPegin: number;
  /** Value in satoshis for the depositor's claim output */
  depositorClaimValue: bigint;
  confirmedUTXOs: DepositUtxo[];
  reservedUtxoRefs: UtxoRef[];
}

export interface PeginPrepareResult {
  btcTxid: Hex;
  depositorBtcPubkey: string;
  btcTxHex: string;
  selectedUTXOs: DepositUtxo[];
  fee: bigint;
}

export interface PeginRegisterParams {
  btcWalletProvider: BitcoinWallet;
  walletClient: WalletClient;
  depositorBtcPubkey: string;
  fundedTxHex: string;
  vaultProviderAddress: string;
  onPopSigned?: () => void;
  /** Keccak256 hash of the depositor's Lamport public key */
  depositorLamportPkHash?: Hex;
}

export interface PeginRegisterResult {
  btcTxid: string;
  ethTxHash: Hex;
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
