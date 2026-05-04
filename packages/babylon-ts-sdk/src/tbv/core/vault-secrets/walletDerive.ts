/**
 * Internal helper that calls the wallet's `deriveContextHash` and
 * validates the response shape. Shared by all per-purpose derivation
 * helpers in this module.
 *
 * @module vault-secrets/walletDerive
 */

import { hexToUint8Array, uint8ArrayToHex } from "../primitives/utils/bitcoin";

/** SHA-256 output size, per `derive-context-hash.md` §2.1. */
const DERIVE_OUTPUT_BYTES = 32;
const DERIVE_OUTPUT_HEX_LEN = DERIVE_OUTPUT_BYTES * 2;
const LOWERCASE_HEX_RE = /^[0-9a-f]+$/;

/**
 * Minimal structural shape for the wallet capability needed by the
 * derivation helpers. Typed against the method directly so callers
 * can pass `BitcoinWallet`, the wallet-connector `IBTCProvider`, or a
 * test mock without depending on the rest of either interface.
 */
export interface DeriveContextHashCapableWallet {
  deriveContextHash(appName: string, context: string): Promise<string>;
}

/**
 * Call `wallet.deriveContextHash(appName, hex(contextBytes))` and
 * return the 32-byte result. Validates that the wallet returned a
 * 64-char lowercase hex string per spec.
 *
 * Errors from the wallet (user rejection, method not supported, etc.)
 * propagate unchanged.
 */
export async function deriveContextHashBytes(
  wallet: DeriveContextHashCapableWallet,
  appName: string,
  contextBytes: Uint8Array,
): Promise<Uint8Array> {
  const contextHex = uint8ArrayToHex(contextBytes);
  const resultHex = await wallet.deriveContextHash(appName, contextHex);

  if (typeof resultHex !== "string") {
    throw new Error(
      `deriveContextHash (${appName}): wallet must return a string, got ${typeof resultHex}`,
    );
  }
  if (resultHex.length !== DERIVE_OUTPUT_HEX_LEN) {
    throw new Error(
      `deriveContextHash (${appName}): wallet must return a ${DERIVE_OUTPUT_HEX_LEN}-character hex string (${DERIVE_OUTPUT_BYTES} bytes), got length ${resultHex.length}`,
    );
  }
  if (!LOWERCASE_HEX_RE.test(resultHex)) {
    throw new Error(
      `deriveContextHash (${appName}): wallet must return lowercase hex per derive-context-hash.md §2.1; got value with non-lowercase or non-hex characters`,
    );
  }

  return hexToUint8Array(resultHex);
}
