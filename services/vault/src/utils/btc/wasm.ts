/**
 * WASM Utilities - Payout Connector
 *
 * This module provides utilities for payout connectors using the WASM package.
 * For peg-in transactions, use the SDK primitives from @babylonlabs-io/ts-sdk.
 */

import {
  createPayoutConnector as createPayoutConnectorWasm,
  type Network,
  type PayoutConnectorInfo,
  type PayoutConnectorParams,
  WasmPeginPayoutConnector,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";

export type { Network, PayoutConnectorInfo, PayoutConnectorParams };

/**
 * Creates a payout connector for vault transactions.
 *
 * The payout connector generates the necessary taproot scripts and information
 * required for signing payout transactions (both optimistic and regular payout paths).
 *
 * @param params - Parameters for creating the payout connector
 * @param network - Bitcoin network
 * @returns Payout connector information including scripts, hashes, and address
 *
 * @example
 * ```typescript
 * const payoutInfo = await createPayoutConnector({
 *   depositor: "abc123...",
 *   vaultProvider: "def456...",
 *   liquidators: ["ghi789..."]
 * }, "testnet");
 *
 * console.log(payoutInfo.taprootScriptHash); // Use this for PSBT signing
 * console.log(payoutInfo.address); // P2TR address
 * ```
 */
export async function createPayoutConnector(
  params: PayoutConnectorParams,
  network: Network,
): Promise<PayoutConnectorInfo> {
  return await createPayoutConnectorWasm(params, network);
}

// Re-export the raw WASM types if needed
export { WasmPeginPayoutConnector };
