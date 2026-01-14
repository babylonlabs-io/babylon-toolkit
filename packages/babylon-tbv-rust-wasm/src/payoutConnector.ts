// @ts-expect-error - WASM files are in dist/generated/ (checked into git), not src/generated/
import { WasmPeginPayoutConnector } from "./generated/btc_vault.js";
import { initWasm } from "./index.js";
import type { PayoutConnectorParams, PayoutConnectorInfo, Network } from "./types.js";

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
  network: Network
): Promise<PayoutConnectorInfo> {
  await initWasm();

  const connector = new WasmPeginPayoutConnector(
    params.depositor,
    params.vaultProvider,
    params.liquidators
  );

  return {
    payoutScript: connector.getPayoutScript(),
    taprootScriptHash: connector.getTaprootScriptHash(),
    scriptPubKey: connector.getScriptPubKey(network),
    address: connector.getAddress(network),
  };
}
