/**
 * Payout Script Generator Primitive
 *
 * This module provides pure functions for generating payout scripts and taproot information
 * by wrapping the WASM implementation from @babylonlabs-io/babylon-tbv-rust-wasm.
 *
 * The payout script is used for signing payout transactions in the vault system.
 * It defines the spending conditions for the vault output, enabling the depositor
 * to authorize payouts during the peg-in flow (Step 3).
 *
 * @remarks
 * This is a low-level primitive. For most use cases, prefer using {@link buildPayoutPsbt}
 * which handles script creation internally. For high-level wallet orchestration, use
 * PayoutManager from the managers module.
 *
 * @see {@link buildPayoutPsbt} - Higher-level function that uses this internally
 *
 * @module primitives/scripts/payout
 */

import {
  createPayoutConnector,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";

/**
 * Parameters for creating a payout script.
 *
 * These parameters define the participants in a vault and are used to generate
 * the taproot script that controls how funds can be spent from the vault.
 */
export interface PayoutScriptParams {
  /**
   * Depositor's BTC public key (x-only, 64-char hex without 0x prefix).
   *
   * This is the user depositing BTC into the vault. The depositor must sign
   * payout transactions to authorize fund distribution.
   */
  depositor: string;

  /**
   * Vault provider's BTC public key (x-only, 64-char hex without 0x prefix).
   *
   * The service provider managing vault operations. Also referred to as
   * "claimer" in the WASM layer.
   */
  vaultProvider: string;

  /**
   * Array of vault keeper BTC public keys (x-only, 64-char hex without 0x prefix).
   *
   * Vault keepers participate in vault operations and script spending conditions.
   */
  vaultKeepers: string[];

  /**
   * Array of universal challenger BTC public keys (x-only, 64-char hex without 0x prefix).
   *
   * These parties can challenge the vault under certain conditions.
   */
  universalChallengers: string[];

  /**
   * Bitcoin network for script generation.
   *
   * Must match the network used for all other vault operations to ensure
   * address encoding compatibility.
   */
  network: Network;
}

/**
 * Result of creating a payout script.
 *
 * Contains all the taproot-related data needed for constructing and signing
 * payout transactions from the vault.
 */
export interface PayoutScriptResult {
  /**
   * The payout script hex used in taproot script path spending.
   *
   * This is the raw script bytes that define the spending conditions,
   * encoded as a hexadecimal string. Used when constructing the
   * tapLeafScript for PSBT signing.
   */
  payoutScript: string;

  /**
   * The taproot script hash (leaf hash) for the payout script.
   *
   * This is the tagged hash of the script used in taproot tree construction.
   * Required for computing the control block during script path spending.
   */
  taprootScriptHash: string;

  /**
   * The full scriptPubKey for the vault output address.
   *
   * This is the complete output script (OP_1 <32-byte-key>) that should be
   * used when creating the vault output in a peg-in transaction.
   */
  scriptPubKey: string;

  /**
   * The vault Bitcoin address derived from the script.
   *
   * A human-readable bech32m address (bc1p... for mainnet, tb1p... for testnet/signet)
   * that can be used to receive funds into the vault.
   */
  address: string;
}

/**
 * Create payout script and taproot information using WASM.
 *
 * This is a pure function that wraps the Rust WASM implementation.
 * The payout connector generates the necessary taproot scripts and information
 * required for signing payout transactions.
 *
 * @remarks
 * The generated script encodes spending conditions that require signatures from
 * the depositor and vault provider (or liquidators in challenge scenarios).
 * This script is used internally by {@link buildPayoutPsbt}.
 *
 * @param params - Payout script parameters defining vault participants and network
 * @returns Payout script and taproot information for PSBT construction
 *
 * @see {@link buildPayoutPsbt} - Use this for building complete payout PSBTs
 */
export async function createPayoutScript(
  params: PayoutScriptParams,
): Promise<PayoutScriptResult> {
  // Call the WASM wrapper with the correct parameter structure
  const connector = await createPayoutConnector(
    {
      depositor: params.depositor,
      vaultProvider: params.vaultProvider,
      vaultKeepers: params.vaultKeepers,
      universalChallengers: params.universalChallengers,
    },
    params.network,
  );

  return {
    payoutScript: connector.payoutScript,
    taprootScriptHash: connector.taprootScriptHash,
    scriptPubKey: connector.scriptPubKey,
    address: connector.address,
  };
}
