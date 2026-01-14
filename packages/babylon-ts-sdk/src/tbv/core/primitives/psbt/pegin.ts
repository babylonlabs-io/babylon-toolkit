/**
 * Peg-in PSBT Builder Primitive
 *
 * This module provides pure functions for building unsigned peg-in PSBTs
 * by wrapping the WASM implementation from @babylonlabs-io/babylon-tbv-rust-wasm.
 *
 * @module primitives/psbt/pegin
 */

import {
  createPegInTransaction,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";

/**
 * Parameters for building an unsigned peg-in PSBT
 */
export interface PeginParams {
  /**
   * Depositor's BTC public key (x-only, 64-char hex without 0x prefix)
   */
  depositorPubkey: string;

  /**
   * Vault provider's BTC public key (x-only, 64-char hex)
   */
  vaultProviderPubkey: string;

  /**
   * Array of vault keeper BTC public keys (x-only, 64-char hex)
   */
  vaultKeeperPubkeys: string[];

  /**
   * Array of universal challenger BTC public keys (x-only, 64-char hex)
   */
  universalChallengerPubkeys: string[];

  /**
   * Amount to peg in (in satoshis)
   */
  pegInAmount: bigint;

  /**
   * Bitcoin network
   */
  network: Network;
}

/**
 * Result of building an unsigned peg-in PSBT
 */
export interface PeginPsbtResult {
  /**
   * Unsigned transaction hex
   *
   * Note: This is an unfunded transaction with no inputs and one output (the pegin output).
   * The caller is responsible for:
   * - Selecting UTXOs to fund the transaction
   * - Calculating transaction fees
   * - Adding inputs to cover pegInAmount + fees
   * - Adding a change output if needed
   * - Creating and signing the PSBT via wallet
   */
  psbtHex: string;

  /**
   * Transaction ID (will change after adding inputs and signing)
   */
  txid: string;

  /**
   * Vault script pubkey hex
   */
  vaultScriptPubKey: string;

  /**
   * Vault output value (in satoshis)
   */
  vaultValue: bigint;
}

/**
 * Build unsigned peg-in PSBT using WASM
 *
 * This is a pure function that wraps the Rust WASM implementation.
 * It creates an unfunded Bitcoin transaction with no inputs and one output
 * (the peg-in output to the vault address).
 *
 * The returned transaction must be funded by the caller by:
 * 1. Selecting appropriate UTXOs from the wallet
 * 2. Calculating transaction fees based on selected inputs
 * 3. Adding inputs to cover pegInAmount + fees
 * 4. Adding a change output if the input value exceeds pegInAmount + fees
 * 5. Creating a PSBT and signing it via the wallet
 *
 * @param params - Peg-in parameters
 * @returns Unsigned PSBT and transaction details
 */
export async function buildPeginPsbt(
  params: PeginParams,
): Promise<PeginPsbtResult> {
  // Call the WASM wrapper with the exact parameter names it expects
  const result = await createPegInTransaction({
    depositorPubkey: params.depositorPubkey,
    vaultProviderPubkey: params.vaultProviderPubkey,
    vaultKeeperPubkeys: params.vaultKeeperPubkeys,
    universalChallengerPubkeys: params.universalChallengerPubkeys,
    pegInAmount: params.pegInAmount,
    network: params.network,
  });

  return {
    psbtHex: result.txHex,
    txid: result.txid,
    vaultScriptPubKey: result.vaultScriptPubKey,
    vaultValue: result.vaultValue,
  };
}
