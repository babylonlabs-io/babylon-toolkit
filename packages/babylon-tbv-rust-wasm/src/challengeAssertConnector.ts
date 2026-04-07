// @ts-expect-error - WASM files are in dist/generated/ (checked into git), not src/generated/
import { WasmAssertChallengeAssertConnector } from "./generated/btc_vault.js";
import { initWasm } from "./index.js";
import type {
  ChallengeAssertConnectorParams,
  ChallengeAssertScriptInfo,
} from "./types.js";

/** @see btc-vault crates/vault/src/assert/challenge_assert_connector.rs — Rust WASM bindings */

/**
 * Get the ChallengeAssert script and control block.
 *
 * Used to build ChallengeAssert PSBTs for the depositor-as-claimer path.
 * Each challenger has 3 ChallengeAssert transactions, and this connector
 * generates the spending scripts using WOTS public keys from the VP.
 *
 * @param params - ChallengeAssert connector parameters
 * @returns Script and control block (hex encoded)
 */
export async function getChallengeAssertScriptInfo(
  params: ChallengeAssertConnectorParams,
): Promise<ChallengeAssertScriptInfo> {
  await initWasm();

  const conn = new WasmAssertChallengeAssertConnector(
    params.claimer,
    params.challenger,
    params.claimerWotsKeysJson,
    params.gcWotsKeysJson,
  );

  try {
    return {
      script: conn.getScript(),
      controlBlock: conn.getControlBlock(),
    };
  } finally {
    conn.free();
  }
}
