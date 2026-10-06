/**
 * ChallengeAssert output connector — the script that output 0 of every
 * ChallengeAssertX/Y transaction pays to.
 *
 * A depositor pre-signing NoPayout commits to that output (NoPayout spends it
 * as inputs 1 and 2), so the scriptPubKey returned here is what a VP-supplied
 * ChallengeAssert must carry before the depositor signs. The NoPayout leaf in
 * this tree is the only place the ChallengeAssert timelock is enforced.
 *
 * @see vault-wasm src/dispatch/challenge_assert_output_connector.rs
 */

import type * as VaultWasm from '../dist/generated/vault_wasm.js';
import { toError } from './errors.js';
import type { ChallengeAssertOutputConnectorParams } from './types.js';

/**
 * Loads the wasm-bindgen surface. The browser and Node entries each pass
 * their own loader, so this surface has one implementation.
 */
type GetWasmBindings = () => Promise<typeof VaultWasm>;

/**
 * Output label hashes per challenger: one per finalized GC instance
 * (`NUM_FINALIZED_INSTANCES` in btc-vault `crates/vault/src/lib.rs`).
 */
const OUTPUT_LABEL_HASH_COUNT = 6;

/** Largest relative timelock the connector accepts (a Rust `NonZeroU16`). */
const MAX_TIMELOCK_CHALLENGE_ASSERT = 0xffff;

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

/** A segwit v1 (P2TR) scriptPubKey: `OP_1 OP_PUSHBYTES_32 <32-byte key>`. */
const P2TR_SCRIPT_PUBKEY_HEX_RE = /^5120[0-9a-f]{64}$/;

function assertTimelockChallengeAssert(value: number): void {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_TIMELOCK_CHALLENGE_ASSERT
  ) {
    throw new Error(
      `timelockChallengeAssert must be an integer in 1..${MAX_TIMELOCK_CHALLENGE_ASSERT}, got ${value}`,
    );
  }
}

function assertOutputLabelHashes(hashes: string[]): void {
  if (!Array.isArray(hashes) || hashes.length !== OUTPUT_LABEL_HASH_COUNT) {
    throw new Error(
      `outputLabelHashes must hold exactly ${OUTPUT_LABEL_HASH_COUNT} hashes, got ${Array.isArray(hashes) ? hashes.length : typeof hashes}`,
    );
  }
  hashes.forEach((hash, i) => {
    if (typeof hash !== 'string' || !SHA256_HEX_RE.test(hash)) {
      throw new Error(
        `outputLabelHashes[${i}] must be 64 lowercase hex characters`,
      );
    }
  });
}

export function createChallengeAssertOutputConnectorApi(
  getWasmBindings: GetWasmBindings,
) {
  return {
    /**
     * Get the scriptPubKey (hex) of the ChallengeAssert output connector.
     *
     * @param params - Claimer, challenger, timelock, the challenger's output
     *   label hashes and the network
     * @returns P2TR scriptPubKey, hex encoded
     * @throws If an input is malformed, the version is unsupported, or WASM
     *   returns anything other than a P2TR scriptPubKey
     */
    async getChallengeAssertOutputScriptPubKey(
      params: ChallengeAssertOutputConnectorParams,
    ): Promise<string> {
      assertTimelockChallengeAssert(params.timelockChallengeAssert);
      assertOutputLabelHashes(params.outputLabelHashes);
      const { WasmChallengeAssertOutputConnector } = await getWasmBindings();

      let scriptPubKey: string;
      try {
        const conn = new WasmChallengeAssertOutputConnector(
          params.txGraphVersion,
          params.claimer,
          params.challenger,
          params.timelockChallengeAssert,
          params.outputLabelHashes,
        );
        try {
          scriptPubKey = conn.getScriptPubKey(params.network);
        } finally {
          conn.free();
        }
      } catch (err) {
        throw toError(err, 'getChallengeAssertOutputScriptPubKey');
      }

      if (!P2TR_SCRIPT_PUBKEY_HEX_RE.test(scriptPubKey)) {
        throw new Error(
          'getChallengeAssertOutputScriptPubKey: WASM returned a value that is not a P2TR scriptPubKey',
        );
      }
      return scriptPubKey;
    },
  };
}
