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
 *   vaultKeepers: ["ghi789..."],
 *   universalChallengers: ["jkl012..."]
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
    params.vaultKeepers,
    params.universalChallengers,
    params.timelockPegin
  );

  try {
    return {
      payoutScript: connector.getPayoutScript(),
      taprootScriptHash: connector.getTaprootScriptHash(),
      scriptPubKey: connector.getScriptPubKey(network),
      address: connector.getAddress(network),
      payoutControlBlock: connector.getPayoutControlBlock(),
    };
  } finally {
    connector.free();
  }
}

/**
 * Get the payout script and control block from the PeginPayoutConnector (no network needed).
 *
 * Used by payout PSBT builders to get the correct taproot script and control block
 * for signing input 0 (PegIn vault UTXO).
 *
 * @param params - Payout connector parameters
 * @returns Payout script and control block (hex encoded)
 */
export async function getPeginPayoutScriptInfo(
  params: PayoutConnectorParams,
): Promise<{ payoutScript: string; payoutControlBlock: string }> {
  await initWasm();

  const connector = new WasmPeginPayoutConnector(
    params.depositor,
    params.vaultProvider,
    params.vaultKeepers,
    params.universalChallengers,
    params.timelockPegin
  );

  try {
    return {
      payoutScript: connector.getPayoutScript(),
      payoutControlBlock: connector.getPayoutControlBlock(),
    };
  } finally {
    connector.free();
  }
}
