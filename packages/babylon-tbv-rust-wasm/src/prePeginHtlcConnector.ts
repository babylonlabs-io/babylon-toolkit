// @ts-expect-error - WASM files are in dist/generated/ (checked into git), not src/generated/
import { WasmPrePeginHtlcConnector } from "./generated/btc_vault.js";
import { initWasm } from "./index.js";
import type { PrePeginHtlcConnectorParams, PrePeginHtlcConnectorInfo, Network } from "./types.js";

/**
 * Creates a Pre-PegIn HTLC connector and returns all spending information.
 *
 * The HTLC connector defines the Taproot spending conditions for the
 * Pre-PegIn output:
 * - Leaf 0 (hashlock): Secret reveal + all-party signatures
 * - Leaf 1 (refund): Depositor signature after CSV timelock
 *
 * @param params - HTLC connector parameters (public keys, hash commitment, timelock)
 * @param network - Bitcoin network
 * @returns HTLC connector info including address, scripts, and control blocks
 */
export async function createPrePeginHtlcConnector(
  params: PrePeginHtlcConnectorParams,
  network: Network,
): Promise<PrePeginHtlcConnectorInfo> {
  await initWasm();

  const connector = new WasmPrePeginHtlcConnector(
    params.depositor,
    params.vaultProvider,
    params.vaultKeepers,
    params.universalChallengers,
    params.hashH,
    params.timelockRefund,
  );

  return {
    address: connector.getAddress(network),
    scriptPubKey: connector.getScriptPubKey(network),
    hashlockScript: connector.getHashlockScript(),
    hashlockControlBlock: connector.getHashlockControlBlock(),
    refundScript: connector.getRefundScript(),
    refundControlBlock: connector.getRefundControlBlock(),
  };
}
