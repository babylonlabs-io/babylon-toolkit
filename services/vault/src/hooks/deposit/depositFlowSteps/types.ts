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
export enum DepositFlowStep {
  /** Step 0: Sign and broadcast split transaction (SPLIT strategy only) */
  SIGN_SPLIT_TX = 0,
  /** Step 1: Sign proof of possession in BTC wallet */
  SIGN_POP = 1,
  /** Step 2: Sign and submit peg-in request in ETH wallet */
  SUBMIT_PEGIN = 2,
  /** Step 3: Sign payout transactions in BTC wallet */
  SIGN_PAYOUTS = 3,
  /** Step 4: Sign and broadcast BTC transaction */
  BROADCAST_BTC = 4,
  /** Step 5: Deposit completed */
  COMPLETED = 5,
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

export interface PeginSubmitParams {
  btcWalletProvider: BitcoinWallet;
  walletClient: WalletClient;
  amount: bigint;
  feeRate: number;
  btcAddress: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  confirmedUTXOs: DepositUtxo[];
  /** Reserved UTXOs to avoid (from in-flight deposits). */
  reservedUtxoRefs: UtxoRef[];
  onPopSigned?: () => void;
  /** Optional pre-signed BTC PoP signature (hex with 0x prefix). */
  preSignedBtcPopSignature?: Hex;
}

export interface PeginSubmitResult {
  btcTxid: string;
  ethTxHash: Hex;
  depositorBtcPubkey: string;
  btcTxHex: string;
  selectedUTXOs: DepositUtxo[];
  fee: bigint;
  /** BTC PoP signature used (hex with 0x prefix), for reuse in multi-vault flows */
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
// Split Transaction
// ============================================================================

/** Result of creating and signing a split transaction */
export interface SplitTxSignResult {
  /** Transaction ID */
  txid: string;
  /** Signed transaction hex */
  signedHex: string;
  /** Output UTXOs created by split transaction */
  outputs: Array<{
    txid: string;
    vout: number;
    value: number;
    scriptPubKey: string;
  }>;
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
