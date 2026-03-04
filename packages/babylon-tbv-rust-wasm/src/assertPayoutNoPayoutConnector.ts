// @ts-expect-error - WASM files are in dist/generated/ (checked into git), not src/generated/
import { WasmAssertPayoutNoPayoutConnector } from "./generated/btc_vault.js";
import { initWasm } from "./index.js";
import type {
  AssertPayoutNoPayoutConnectorParams,
  AssertPayoutScriptInfo,
  AssertNoPayoutScriptInfo,
} from "./types.js";

/** @see btc-vault crates/vault/src/assert/payout_nopayout_connector.rs — Rust WASM bindings */

let connector: InstanceType<typeof WasmAssertPayoutNoPayoutConnector> | null = null;
let connectorKey: string | null = null;

/**
 * Get or create a cached Assert Payout/NoPayout connector instance.
 *
 * The connector is reused when the same parameters are provided.
 */
function getConnector(
  params: AssertPayoutNoPayoutConnectorParams,
): InstanceType<typeof WasmAssertPayoutNoPayoutConnector> {
  const key = JSON.stringify(params);
  if (connector && connectorKey === key) {
    return connector;
  }

  connector = new WasmAssertPayoutNoPayoutConnector(
    params.claimer,
    params.localChallengers,
    params.universalChallengers,
    params.timelockAssert,
    params.councilMembers,
    params.councilQuorum,
  );
  connectorKey = key;
  return connector;
}

/**
 * Get the Payout script and control block for the depositor's Assert output.
 *
 * Used to build the depositor's Payout PSBT (depositor-as-claimer path).
 *
 * @param params - Assert Payout/NoPayout connector parameters
 * @returns Payout script and control block (hex encoded)
 */
export async function getAssertPayoutScriptInfo(
  params: AssertPayoutNoPayoutConnectorParams,
): Promise<AssertPayoutScriptInfo> {
  await initWasm();

  const conn = getConnector(params);
  return {
    payoutScript: conn.getPayoutScript(),
    payoutControlBlock: conn.getPayoutControlBlock(),
  };
}

/**
 * Get the NoPayout script and control block for a specific challenger.
 *
 * Used to build the depositor's NoPayout PSBT (depositor-as-claimer path).
 * Each challenger has a distinct NoPayout script.
 *
 * @param params - Assert Payout/NoPayout connector parameters
 * @param challengerPubkey - The challenger's x-only public key (hex encoded)
 * @returns NoPayout script and control block (hex encoded)
 */
export async function getAssertNoPayoutScriptInfo(
  params: AssertPayoutNoPayoutConnectorParams,
  challengerPubkey: string,
): Promise<AssertNoPayoutScriptInfo> {
  await initWasm();

  const conn = getConnector(params);
  return {
    noPayoutScript: conn.getNoPayoutScript(challengerPubkey),
    noPayoutControlBlock: conn.getNoPayoutControlBlock(challengerPubkey),
  };
}
