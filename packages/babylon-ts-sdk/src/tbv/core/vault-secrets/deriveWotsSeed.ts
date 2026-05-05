/**
 * Per-purpose derivation of the per-vault 64-byte `wotsSeed`, fed into
 * `deriveWotsBlocksFromSeed` to produce the one-time signature
 * keypairs used for the BTC vault's BaBe / claim-graph commitments
 * and Assert-path signing.
 *
 * The wallet returns 32 bytes per `deriveContextHash` call but the
 * WOTS algorithm requires a 64-byte seed (matched byte-for-byte
 * against `babe::wots`). The seed is produced from a single
 * wallet-derived 32-byte pseudorandom key via HKDF-Expand-SHA-256
 * with a fixed domain-separator info string. Expansion is contained
 * within the WOTS purpose label — auth and hashlock secrets are
 * never derivable from this output.
 *
 * Phishing model: a fooled approval for `babylon-btc-vault-wots`
 * gives the attacker WOTS-forgery capability for that one vault
 * context — the same blast radius as a fooled approval for any other
 * per-purpose label. Per-secret-type containment is preserved; per-
 * vault containment is preserved.
 *
 * Only the `keccak256` hash of the derived public keys appears
 * on-chain as `depositorWotsPkHash`.
 *
 * @module vault-secrets/deriveWotsSeed
 */

import { expand as hkdfExpand } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

import { buildPerVaultContext, type VaultContextInput } from "./context";
import {
  deriveContextHashBytes,
  type DeriveContextHashCapableWallet,
} from "./walletDerive";

const WOTS_SEED_SIZE = 64;

/** HKDF-Expand domain separator. Bound to the WOTS purpose. */
const WOTS_SEED_HKDF_INFO = new TextEncoder().encode(
  "babylon-btc-vault-wots-seed",
);

/**
 * Wallet `appName` for the WOTS seed root.
 *
 * @stability frozen — on-chain-binding via `depositorWotsPkHash`. Any
 * change to the label or to {@link WOTS_SEED_HKDF_INFO} rotates the
 * seed and invalidates existing WOTS commitments.
 */
export const WOTS_SEED_APP_NAME = "babylon-btc-vault-wots";

/**
 * Derive the per-vault 64-byte WOTS seed via one `deriveContextHash`
 * call followed by HKDF-Expand-SHA-256 over the 32-byte wallet output.
 *
 * Best-effort memory hygiene: the 32-byte root `Uint8Array` is zeroed
 * before return, including on the throw path. Note that the immutable
 * hex string the wallet returned upstream cannot be wiped and remains
 * resident until GC — we minimise lifetime, not residency.
 *
 * @returns 64-byte seed.
 */
export async function deriveWotsSeed(
  wallet: DeriveContextHashCapableWallet,
  input: VaultContextInput,
  htlcVout: number,
): Promise<Uint8Array> {
  const context = buildPerVaultContext(input, htlcVout);
  const root = await deriveContextHashBytes(
    wallet,
    WOTS_SEED_APP_NAME,
    context,
  );
  try {
    // HKDF-Expand only — the wallet output is already PRK (HKDF-SHA-256
    // output per derive-context-hash.md §2.1), so the Extract step is
    // unnecessary.
    return hkdfExpand(sha256, root, WOTS_SEED_HKDF_INFO, WOTS_SEED_SIZE);
  } finally {
    root.fill(0);
  }
}
