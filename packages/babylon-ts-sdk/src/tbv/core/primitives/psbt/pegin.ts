/**
 * Pre-PegIn PSBT Builder Primitive
 *
 * This module provides pure functions for building unfunded Pre-PegIn transactions
 * and deriving PegIn transactions from them, using the WASM implementation from
 * @babylonlabs-io/babylon-tbv-rust-wasm.
 *
 * Pre-PegIn Flow:
 * 1. buildPrePeginPsbt()     — creates unfunded Pre-PegIn tx (HTLC output)
 * 2. [caller funds Pre-PegIn tx and computes txid]
 * 3. buildPeginTxFromFundedPrePegin() — derives PegIn tx spending the HTLC
 * 4. buildPeginInputPsbt()   — PSBT for depositor to sign PegIn HTLC leaf 0 input
 *
 * @module primitives/psbt/pegin
 */

import {
  createPrePeginTransaction,
  buildPeginTxFromPrePegin,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";

import { parseUnfundedWasmTransaction } from "../../utils/transaction/fundPeginTransaction";

/**
 * Parameters for building an unfunded Pre-PegIn PSBT
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
  /** SHA256 hash commitment (64 hex chars = 32 bytes) */
  hashH: string;
  /** CSV timelock in blocks for the HTLC refund path */
  timelockRefund: number;
  /** Amount to peg in (satoshis) */
  pegInAmount: bigint;
  /** Fee rate in sat/vB from contract offchain params */
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
 * Result of building an unfunded Pre-PegIn transaction
 */
export interface PrePeginPsbtResult {
  /**
   * Unfunded transaction hex (no inputs, HTLC output + CPFP anchor).
   *
   * The caller is responsible for:
   * - Selecting UTXOs covering totalOutputValue + network fees
   * - Funding the transaction (add inputs and change output)
   * - Computing the funded transaction's txid
   * - Calling buildPeginTxFromFundedPrePegin() with the funded txid
   */
  psbtHex: string;
  /** Sum of all unfunded outputs (HTLC + CPFP anchor) — use this for UTXO selection */
  totalOutputValue: bigint;
  /** HTLC output value in satoshis (output 0 only, includes peginAmount + depositorClaimValue + minPeginFee) */
  htlcValue: bigint;
  /** HTLC output scriptPubKey (hex encoded) */
  htlcScriptPubKey: string;
  /** HTLC Taproot address */
  htlcAddress: string;
  /** Pegin amount in satoshis */
  peginAmount: bigint;
  /** Depositor claim value computed by WASM from contract parameters */
  depositorClaimValue: bigint;
}

/**
 * Parameters for building the PegIn transaction from a funded Pre-PegIn txid
 */
export interface BuildPeginTxParams {
  /** Same PrePeginParams used to create the Pre-PegIn transaction */
  prePeginParams: PrePeginParams;
  /** CSV timelock in blocks for the PegIn vault output */
  timelockPegin: number;
  /** Txid of the funded Pre-PegIn transaction (hex, 64 chars) */
  fundedPrePeginTxid: string;
}

/**
 * Result of building the PegIn transaction
 */
export interface PeginTxResult {
  /** PegIn transaction hex (1 input spending HTLC, 1 vault output) */
  txHex: string;
  /** PegIn transaction ID */
  txid: string;
  /** Vault output scriptPubKey (hex encoded) */
  vaultScriptPubKey: string;
  /** Vault output value in satoshis */
  vaultValue: bigint;
}

/**
 * Build unfunded Pre-PegIn transaction using WASM.
 *
 * Creates a Bitcoin transaction template with no inputs, an HTLC output, and a
 * CPFP anchor output. The HTLC value is computed internally from the contract
 * parameters — the caller does not need to compute depositorClaimValue separately.
 *
 * @param params - Pre-PegIn parameters
 * @returns Unfunded Pre-PegIn transaction details with HTLC output information
 * @throws If WASM initialization fails or parameters are invalid
 */
export async function buildPrePeginPsbt(
  params: PrePeginParams,
): Promise<PrePeginPsbtResult> {
  const result = await createPrePeginTransaction({
    depositorPubkey: params.depositorPubkey,
    vaultProviderPubkey: params.vaultProviderPubkey,
    vaultKeeperPubkeys: params.vaultKeeperPubkeys,
    universalChallengerPubkeys: params.universalChallengerPubkeys,
    hashH: params.hashH,
    timelockRefund: params.timelockRefund,
    pegInAmount: params.pegInAmount,
    feeRate: params.feeRate,
    numLocalChallengers: params.numLocalChallengers,
    councilQuorum: params.councilQuorum,
    councilSize: params.councilSize,
    network: params.network,
  });

  // Parse the unfunded tx to sum all output values (HTLC + CPFP anchor).
  // This is the amount UTXOs must cover before adding network fees.
  const parsed = parseUnfundedWasmTransaction(result.txHex);
  const totalOutputValue = parsed.outputs.reduce(
    (sum, o) => sum + BigInt(o.value),
    0n,
  );

  return {
    psbtHex: result.txHex,
    totalOutputValue,
    htlcValue: result.htlcValue,
    htlcScriptPubKey: result.htlcScriptPubKey,
    htlcAddress: result.htlcAddress,
    peginAmount: result.peginAmount,
    depositorClaimValue: result.depositorClaimValue,
  };
}

/**
 * Build the PegIn transaction from a funded Pre-PegIn txid.
 *
 * The PegIn transaction spends Pre-PegIn output 0 via the HTLC hashlock leaf (leaf 0).
 * Since Pre-PegIn inputs must be SegWit/Taproot, the txid is stable after funding.
 *
 * @param params - Build parameters including Pre-PegIn params and funded txid
 * @returns PegIn transaction details
 * @throws If WASM initialization fails or parameters are invalid
 */
export async function buildPeginTxFromFundedPrePegin(
  params: BuildPeginTxParams,
): Promise<PeginTxResult> {
  const result = await buildPeginTxFromPrePegin(
    {
      depositorPubkey: params.prePeginParams.depositorPubkey,
      vaultProviderPubkey: params.prePeginParams.vaultProviderPubkey,
      vaultKeeperPubkeys: params.prePeginParams.vaultKeeperPubkeys,
      universalChallengerPubkeys: params.prePeginParams.universalChallengerPubkeys,
      hashH: params.prePeginParams.hashH,
      timelockRefund: params.prePeginParams.timelockRefund,
      pegInAmount: params.prePeginParams.pegInAmount,
      feeRate: params.prePeginParams.feeRate,
      numLocalChallengers: params.prePeginParams.numLocalChallengers,
      councilQuorum: params.prePeginParams.councilQuorum,
      councilSize: params.prePeginParams.councilSize,
      network: params.prePeginParams.network,
    },
    params.timelockPegin,
    params.fundedPrePeginTxid,
  );

  return {
    txHex: result.txHex,
    txid: result.txid,
    vaultScriptPubKey: result.vaultScriptPubKey,
    vaultValue: result.vaultValue,
  };
}
