/**
 * Type definitions for deposit flow steps
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type {
  PopSignature,
  WotsBlockPublicKey,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Hex, WalletClient } from "viem";

// ============================================================================
// Deposit Flow Steps
// ============================================================================

/**
 * Deposit flow step numbers.
 *
 * Numeric values enable ordered comparisons (e.g. `currentStep >= SIGN_PAYOUTS`).
 */
export enum DepositFlowStep {
  /** Step 1: Derive vault secret in BTC wallet (deriveContextHash popup) */
  DERIVE_VAULT_SECRET = 1,
  /** Step 2: Sign the per-vault peg-in BTC PSBT (does NOT broadcast) */
  SIGN_PEGIN_BTC = 2,
  /** Step 3: Sign proof of possession in BTC wallet */
  SIGN_POP = 3,
  /** Step 4: Submit peg-in to Ethereum (registers vault on-chain) */
  SUBMIT_PEGIN = 4,
  /** Step 5: Sign and broadcast Pre-PegIn transaction to Bitcoin */
  BROADCAST_PRE_PEGIN = 5,
  /**
   * Step 6: Awaiting Bitcoin confirmation of the Pre-PegIn tx before the
   * Vault Provider will accept WOTS keys / return payout PSBTs.
   */
  AWAIT_BTC_CONFIRMATION = 6,
  /** Step 7: Submit WOTS public key to the Vault Provider. */
  SUBMIT_WOTS_KEYS = 7,
  /**
   * Step 8: `deriveContextHash` for the VP auth anchor during payout
   * signing. Fires whenever the per-pegin VP-token cache misses inside
   * `signAndSubmitPayouts`. (Cache misses inside `submitWotsPublicKey`
   * still surface a wallet popup, but the stepper stays on
   * SUBMIT_WOTS_KEYS for that path.) The wallet popup is identical to
   * step 1 but binds a different context (auth anchor vs. vault root).
   */
  SIGN_AUTH_ANCHOR = 8,
  /** Step 9: Sign payout transactions in BTC wallet */
  SIGN_PAYOUTS = 9,
  /** Step 10: Download vault artifacts */
  ARTIFACT_DOWNLOAD = 10,
  /** Step 11: Reveal HTLC secret on Ethereum to activate the vault */
  ACTIVATE_VAULT = 11,
  /** Step 12: Deposit completed */
  COMPLETED = 12,
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
  /** On-chain vault id — needed to validate `unsignedPrePeginTxHex` against `prePeginTxHash` on the cold-cache VP-auth path. */
  vaultId: Hex;
  peginTxHash: string;
  depositorBtcPubkey: string;
  providerAddress: string;
  wotsPublicKeys: WotsBlockPublicKey[];
  btcWallet: BitcoinWallet;
  unsignedPrePeginTxHex: string;
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
