import { getWasmBindings } from "./wasm-loader.js";
import type {
  AssertPayoutNoPayoutConnectorParams,
  AssertPayoutScriptInfo,
  AssertNoPayoutScriptInfo,
} from "./types.js";

/** @see btc-vault crates/vault/src/assert/payout_nopayout_connector.rs — Rust WASM bindings */

interface AssertPayoutNoPayoutConnector {
  free(): void;
  getPayoutScript(): string;
  getPayoutControlBlock(): string;
  getNoPayoutScript(challengerPubkey: string): string;
  getNoPayoutControlBlock(challengerPubkey: string): string;
}

/**
 * Create an Assert Payout/NoPayout connector owned by one facade call.
 * Keeping ownership local prevents concurrent calls with different params
 * from freeing one another's WASM object between asynchronous initialization
 * and the synchronous getter calls.
 */
async function createConnector(
  params: AssertPayoutNoPayoutConnectorParams,
): Promise<AssertPayoutNoPayoutConnector> {
  const { WasmAssertPayoutNoPayoutConnector } = await getWasmBindings();
  return new WasmAssertPayoutNoPayoutConnector(
    params.txGraphVersion,
    params.claimer,
    params.localChallengers,
    params.universalChallengers,
    params.timelockAssert,
    params.councilMembers,
    params.councilQuorum,
  );
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
  const conn = await createConnector(params);
  try {
    return {
      payoutScript: conn.getPayoutScript(),
      payoutControlBlock: conn.getPayoutControlBlock(),
    };
  } finally {
    conn.free();
  }
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
  const conn = await createConnector(params);
  try {
    return {
      noPayoutScript: conn.getNoPayoutScript(challengerPubkey),
      noPayoutControlBlock: conn.getNoPayoutControlBlock(challengerPubkey),
    };
  } finally {
    conn.free();
  }
}
