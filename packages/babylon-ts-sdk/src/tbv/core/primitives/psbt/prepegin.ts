// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — Pre-PegIn imports not yet available until WASM is rebuilt with Pre-PegIn support
/**
 * Pre-PegIn PSBT Builder Primitive (New PegIn Flow)
 *
 * This module provides pure functions for building Pre-PegIn transactions
 * and deriving PegIn/refund transactions from them.
 *
 * The Pre-PegIn transaction locks BTC in an HTLC with two spend paths:
 * - Hashlock: Secret reveal + all-party signatures → enables PegIn activation
 * - Refund: Depositor reclaims after CSV timelock → safety net if activation fails
 *
 * @module primitives/psbt/prepegin
 */

import {
  createPrePeginTransaction,
  buildPeginFromPrePegin as wasmBuildPeginFromPrePegin,
  buildRefundFromPrePegin as wasmBuildRefundFromPrePegin,
  createPrePeginHtlcConnector,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";

/**
 * Parameters for building an unfunded Pre-PegIn transaction.
 */
export interface PrePeginParams {
  /** Depositor's BTC public key (x-only, 64-char hex without 0x prefix) */
  depositorPubkey: string;
  /** Vault provider's BTC public key (x-only, 64-char hex) */
  vaultProviderPubkey: string;
  /** Array of vault keeper BTC public keys (x-only, 64-char hex) */
  vaultKeeperPubkeys: string[];
  /** Array of universal challenger BTC public keys (x-only, 64-char hex) */
  universalChallengerPubkeys: string[];
  /** SHA256 hash commitment h = SHA256(s) (hex, 64 chars = 32 bytes) */
  hashH: string;
  /** CSV timelock for the refund path in blocks (must be non-zero) */
  timelockRefund: number;
  /** Amount in satoshis to lock in the vault */
  peginAmount: bigint;
  /** Fee rate in sat/vB (from contract offchain params) */
  feeRate: bigint;
  /** Number of local challengers (from contract params) */
  numLocalChallengers: number;
  /** M in M-of-N council multisig (from contract params) */
  councilQuorum: number;
  /** N in M-of-N council multisig (from contract params) */
  councilSize: number;
  /** Bitcoin network */
  network: Network;
}

/**
 * Result of building an unfunded Pre-PegIn transaction.
 */
export interface PrePeginPsbtResult {
  /** Unfunded transaction hex (no inputs, HTLC + anchor outputs) */
  psbtHex: string;
  /** Transaction ID (changes after funding) */
  txid: string;
  /** HTLC output scriptPubKey (hex) */
  htlcScriptPubKey: string;
  /** HTLC output value in satoshis */
  htlcValue: bigint;
  /** Taproot address for the HTLC output */
  htlcAddress: string;
  /** Vault amount in satoshis */
  peginAmount: bigint;
  /** Auto-computed depositor claim value in satoshis */
  depositorClaimValue: bigint;
}

/**
 * Result of building a PegIn transaction from a Pre-PegIn.
 */
export interface PeginFromPrePeginPsbtResult {
  /** Transaction hex */
  txHex: string;
  /** Transaction ID */
  txid: string;
  /** Vault script pubkey (hex) */
  vaultScriptPubKey: string;
  /** Vault output value in satoshis */
  vaultValue: bigint;
}

/**
 * HTLC connector information for PSBT construction.
 */
export interface PrePeginHtlcInfo {
  /** Taproot address for the HTLC output */
  address: string;
  /** Taproot scriptPubKey (hex) */
  scriptPubKey: string;
  /** Hashlock + all-party spend script (leaf 0, hex) */
  hashlockScript: string;
  /** Control block for hashlock leaf spending (hex) */
  hashlockControlBlock: string;
  /** Refund script (leaf 1, hex) */
  refundScript: string;
  /** Control block for refund leaf spending (hex) */
  refundControlBlock: string;
}

/**
 * Build an unfunded Pre-PegIn transaction using WASM.
 *
 * This creates a Bitcoin transaction with no inputs and two outputs:
 * - Output 0: HTLC output (peginAmount + depositorClaimValue + peginFee)
 * - Output 1: CPFP anchor (BIP-86 keypath for depositor)
 *
 * The caller must fund this transaction by selecting UTXOs, adding inputs,
 * and adding a change output.
 *
 * @param params - Pre-PegIn parameters
 * @returns Unfunded Pre-PegIn transaction details
 */
export async function buildPrePeginPsbt(
  params: PrePeginParams,
): Promise<PrePeginPsbtResult> {
  const result = await createPrePeginTransaction({
    depositor: params.depositorPubkey,
    vaultProvider: params.vaultProviderPubkey,
    vaultKeepers: params.vaultKeeperPubkeys,
    universalChallengers: params.universalChallengerPubkeys,
    hashH: params.hashH,
    timelockRefund: params.timelockRefund,
    peginAmount: params.peginAmount,
    feeRate: params.feeRate,
    numLocalChallengers: params.numLocalChallengers,
    councilQuorum: params.councilQuorum,
    councilSize: params.councilSize,
    network: params.network,
  });

  return {
    psbtHex: result.txHex,
    txid: result.txid,
    htlcScriptPubKey: result.htlcScriptPubKey,
    htlcValue: result.htlcValue,
    htlcAddress: result.htlcAddress,
    peginAmount: result.peginAmount,
    depositorClaimValue: result.depositorClaimValue,
  };
}

/**
 * Build a PegIn transaction that spends a funded Pre-PegIn's HTLC output.
 *
 * The PegIn transaction has a single input spending Pre-PegIn output 0
 * via the hashlock + all-party script (leaf 0). The fee is already
 * accounted for in the HTLC value.
 *
 * @param prePeginParams - The same params used to create the Pre-PegIn
 * @param timelockPegin - CSV timelock in blocks for the PegIn output
 * @param fundedPrePeginTxid - Txid of the funded Pre-PegIn transaction
 * @returns PegIn transaction details
 */
export async function buildPeginFromPrePeginPsbt(
  prePeginParams: PrePeginParams,
  timelockPegin: number,
  fundedPrePeginTxid: string,
): Promise<PeginFromPrePeginPsbtResult> {
  const result = await wasmBuildPeginFromPrePegin(
    {
      depositor: prePeginParams.depositorPubkey,
      vaultProvider: prePeginParams.vaultProviderPubkey,
      vaultKeepers: prePeginParams.vaultKeeperPubkeys,
      universalChallengers: prePeginParams.universalChallengerPubkeys,
      hashH: prePeginParams.hashH,
      timelockRefund: prePeginParams.timelockRefund,
      peginAmount: prePeginParams.peginAmount,
      feeRate: prePeginParams.feeRate,
      numLocalChallengers: prePeginParams.numLocalChallengers,
      councilQuorum: prePeginParams.councilQuorum,
      councilSize: prePeginParams.councilSize,
      network: prePeginParams.network,
    },
    { timelockPegin, fundedPrePeginTxid },
  );

  return {
    txHex: result.txHex,
    txid: result.txid,
    vaultScriptPubKey: result.vaultScriptPubKey,
    vaultValue: result.vaultValue,
  };
}

/**
 * Build an unsigned refund transaction from a funded Pre-PegIn.
 *
 * The refund transaction spends the HTLC output via the refund script
 * (leaf 1) after the CSV timelock expires. Used when vault activation
 * times out and the depositor needs to reclaim their BTC.
 *
 * @param prePeginParams - The same params used to create the Pre-PegIn
 * @param refundFee - Transaction fee in satoshis
 * @param fundedPrePeginTxid - Txid of the funded Pre-PegIn transaction
 * @returns Unsigned refund transaction hex
 */
export async function buildRefundFromPrePeginPsbt(
  prePeginParams: PrePeginParams,
  refundFee: bigint,
  fundedPrePeginTxid: string,
): Promise<string> {
  return wasmBuildRefundFromPrePegin(
    {
      depositor: prePeginParams.depositorPubkey,
      vaultProvider: prePeginParams.vaultProviderPubkey,
      vaultKeepers: prePeginParams.vaultKeeperPubkeys,
      universalChallengers: prePeginParams.universalChallengerPubkeys,
      hashH: prePeginParams.hashH,
      timelockRefund: prePeginParams.timelockRefund,
      peginAmount: prePeginParams.peginAmount,
      feeRate: prePeginParams.feeRate,
      numLocalChallengers: prePeginParams.numLocalChallengers,
      councilQuorum: prePeginParams.councilQuorum,
      councilSize: prePeginParams.councilSize,
      network: prePeginParams.network,
    },
    { refundFee, fundedPrePeginTxid },
  );
}

/**
 * Get HTLC connector information for building Pre-PegIn PSBTs.
 *
 * Returns the Taproot scripts and control blocks needed for both
 * the hashlock (PegIn activation) and refund spending paths.
 *
 * @param params - Pre-PegIn parameters (uses the same params as buildPrePeginPsbt)
 * @returns HTLC scripts, control blocks, and address
 */
export async function getPrePeginHtlcInfo(
  params: PrePeginParams,
): Promise<PrePeginHtlcInfo> {
  return createPrePeginHtlcConnector(
    {
      depositor: params.depositorPubkey,
      vaultProvider: params.vaultProviderPubkey,
      vaultKeepers: params.vaultKeeperPubkeys,
      universalChallengers: params.universalChallengerPubkeys,
      hashH: params.hashH,
      timelockRefund: params.timelockRefund,
    },
    params.network,
  );
}
