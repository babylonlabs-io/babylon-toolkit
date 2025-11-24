/**
 * BTC Transaction Service
 *
 * Handles creation of BTC peg-in transactions using SDK primitives.
 * Creates unfunded transactions that wallets will fund and sign.
 */

import { buildPeginPsbt } from "@babylonlabs-io/ts-sdk/tbv/core";

import { getBTCNetworkForWASM } from "../../config/pegin";

export interface CreatePeginTxParams {
  /**
   * Depositor's BTC public key (x-only, 32 bytes hex)
   */
  depositorBtcPubkey: string;

  /**
   * Amount to peg in (in satoshis)
   */
  pegInAmount: bigint;

  /**
   * Selected vault provider's BTC public key (x-only, 32 bytes hex)
   * This is the provider chosen by the user in the UI
   */
  vaultProviderBtcPubkey: string;

  /**
   * Liquidator BTC public keys (x-only, 32 bytes hex without 0x prefix)
   * These are the challengers for the selected vault provider
   */
  liquidatorBtcPubkeys: string[];
}

export interface PeginTxResult {
  unsignedTxHex: string;
  txid: string;
  vaultScriptPubKey: string;
  vaultValue: bigint;
}

/**
 * Create an unfunded peg-in transaction
 *
 * This creates a transaction with NO inputs and ONE output (the vault output).
 * The wallet is responsible for:
 * - Selecting UTXOs to fund the transaction
 * - Calculating appropriate fees
 * - Adding inputs to cover peginAmount + fees
 * - Adding change output if needed
 * - Signing the complete transaction
 *
 * @param params - Transaction parameters including depositor pubkey, provider, and liquidators
 * @returns Unfunded BTC transaction details
 */
export async function createPeginTxForSubmission(
  params: CreatePeginTxParams,
): Promise<PeginTxResult> {
  // Create unfunded BTC peg-in transaction using SDK
  const pegInResult = await buildPeginPsbt({
    depositorPubkey: params.depositorBtcPubkey,
    claimerPubkey: params.vaultProviderBtcPubkey,
    challengerPubkeys: params.liquidatorBtcPubkeys,
    pegInAmount: params.pegInAmount,
    network: getBTCNetworkForWASM(),
  });

  return {
    unsignedTxHex: pegInResult.psbtHex,
    txid: pegInResult.txid,
    vaultScriptPubKey: pegInResult.vaultScriptPubKey,
    vaultValue: pegInResult.vaultValue,
  };
}
