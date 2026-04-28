/**
 * Vault-root derivation via the wallet's `deriveContextHash` API.
 *
 * Implements the canonical root source from `derive-vault-secrets.md`
 * §2.2:
 *
 * ```
 * rootDerivation = deriveContextHash("babylon-vault", hex(vaultContext))
 * ```
 *
 * The 32-byte output is fed directly into the {@link expandAuthAnchor},
 * {@link expandHashlockSecret}, and {@link expandWotsSeed} functions in
 * this module.
 *
 * @module vault-secrets/deriveVaultRoot
 */

import { hexToUint8Array, uint8ArrayToHex } from "../primitives/utils/bitcoin";

import { buildVaultContext, type VaultContextInput } from "./context";

/**
 * The fixed `appName` passed to the wallet's `deriveContextHash` for
 * Babylon vault derivations. The wallet displays this in its approval
 * dialog. Defined by `derive-vault-secrets.md` §2.2 — must not be
 * changed without coordinating a spec revision and a downstream
 * migration plan, as it provides app-level domain separation across
 * applications using the same wallet.
 */
export const VAULT_APP_NAME = "babylon-vault";

/** Expected length of the wallet output in bytes per spec §2.1. */
const ROOT_OUTPUT_BYTES = 32;

/** Expected length of the wallet output in lowercase hex chars. */
const ROOT_OUTPUT_HEX_LEN = ROOT_OUTPUT_BYTES * 2;

const LOWERCASE_HEX_RE = /^[0-9a-f]+$/;

/**
 * Minimal structural shape for the wallet capability needed by this
 * helper. Typed against the method directly so callers can pass any
 * value that implements `deriveContextHash` — `BitcoinWallet` from
 * this SDK, `IBTCProvider` from `@babylonlabs-io/wallet-connector`,
 * or a test mock — without depending on the rest of either interface.
 */
export interface DeriveContextHashCapableWallet {
  deriveContextHash(appName: string, context: string): Promise<string>;
}

/**
 * Derive the 32-byte vault root from a wallet by encoding the
 * canonical {@link VaultContextInput} and forwarding to
 * `wallet.deriveContextHash`.
 *
 * Validates the wallet's output strictly: must be exactly 64
 * lowercase hex characters per `derive-context-hash.md` §2.1. A
 * conformant wallet always satisfies this, but we re-check at the
 * SDK boundary so a non-conformant wallet (or a wallet returning a
 * malformed value through a buggy adapter) fails loud here rather
 * than producing silently-wrong derived secrets downstream.
 *
 * The helper itself produces only valid spec inputs (`appName` is
 * the hardcoded `VAULT_APP_NAME`; `context` is hex of the 72-byte
 * `vaultContext`, always 144 chars lowercase), so input-side
 * validation is unnecessary.
 *
 * @param wallet - Any value implementing `deriveContextHash`.
 * @param input  - The canonical {@link VaultContextInput} that
 *                  uniquely identifies the vault. Encoded by
 *                  {@link buildVaultContext} into a 72-byte structure
 *                  before being hex-encoded for the wallet.
 * @stability frozen — on-chain-binding. The pair (`VAULT_APP_NAME`,
 * `vaultContext` encoding) is the wallet's input space; changing
 * either rotates the root and invalidates every secret derived from
 * it. `VAULT_APP_NAME` is fixed by `derive-vault-secrets.md` §2.2
 * and must never change without a coordinated spec revision.
 *
 * @returns 32-byte root suitable for {@link expandAuthAnchor},
 *          {@link expandHashlockSecret}, {@link expandWotsSeed}.
 * @throws If the wallet returns a non-64-char or non-lowercase-hex
 *         string. Errors from the wallet (user rejection,
 *         method-not-supported, etc.) propagate unchanged.
 */
export async function deriveVaultRoot(
  wallet: DeriveContextHashCapableWallet,
  input: VaultContextInput,
): Promise<Uint8Array> {
  const vaultContext = buildVaultContext(input);
  const contextHex = uint8ArrayToHex(vaultContext);

  const rootHex = await wallet.deriveContextHash(VAULT_APP_NAME, contextHex);

  if (typeof rootHex !== "string") {
    throw new Error(
      `deriveVaultRoot: wallet must return a string, got ${typeof rootHex}`,
    );
  }
  if (rootHex.length !== ROOT_OUTPUT_HEX_LEN) {
    throw new Error(
      `deriveVaultRoot: wallet must return a ${ROOT_OUTPUT_HEX_LEN}-character hex string (${ROOT_OUTPUT_BYTES} bytes), got length ${rootHex.length}`,
    );
  }
  if (!LOWERCASE_HEX_RE.test(rootHex)) {
    throw new Error(
      "deriveVaultRoot: wallet must return lowercase hex per derive-context-hash.md §2.1; got value with non-lowercase or non-hex characters",
    );
  }

  return hexToUint8Array(rootHex);
}
