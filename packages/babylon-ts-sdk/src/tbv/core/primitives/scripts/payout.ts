/**
 * Payout Script Generator Primitive
 *
 * This module provides pure functions for generating payout scripts and taproot information
 * by wrapping the WASM implementation from @babylonlabs-io/babylon-tbv-rust-wasm.
 *
 * The payout script is used for signing payout transactions in the vault system.
 *
 * @module primitives/scripts/payout
 */

import {
  createPayoutConnector,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";

/**
 * Parameters for creating a payout script
 */
export interface PayoutScriptParams {
  depositor: string;
  vaultProvider: string;
  vaultKeepers: string[];
  universalChallengers: string[];
  network: Network;
}

/**
 * Result of creating a payout script
 */
export interface PayoutScriptResult {
  payoutScript: string;
  taprootScriptHash: string;
  scriptPubKey: string;
  address: string;
}

/**
 * Create payout script and taproot information using WASM
 *
 * This is a pure function that wraps the Rust WASM implementation.
 * The payout connector generates the necessary taproot scripts and information
 * required for signing payout transactions.
 *
 * @param params - Payout script parameters
 * @returns Payout script and taproot information
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
