/**
 * HKDF-Expand-based vault-secret derivation per
 * `derive-vault-secrets.md` §2.2.
 *
 * Pure, synchronous expanders that derive three domain-separated
 * secrets from a 32-byte `root`. The root is spec-opaque — typically
 * obtained via `deriveVaultRoot(wallet, vaultContextInput)` (which
 * forwards to the wallet's `deriveContextHash`), but any 32-byte
 * pseudorandom source satisfies the contract.
 *
 * All expand calls use HKDF-Expand-SHA-256 with `root` directly as the
 * PRK (RFC 5869 §3.3: the Extract step is omitted when the input is
 * already a uniformly-distributed pseudorandom key of HashLen bytes).
 *
 * @module vault-secrets/expand
 */

import { expand as hkdfExpand } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

import {
  LABEL_AUTH_ANCHOR,
  LABEL_HASHLOCK,
  LABEL_WOTS_SEED,
  buildInfo,
  i2osp4,
} from "./info";

const ROOT_SIZE = 32;
const AUTH_ANCHOR_SIZE = 32;
const HASHLOCK_SIZE = 32;
const WOTS_SEED_SIZE = 64;

function assertRoot(root: Uint8Array): void {
  if (root.length !== ROOT_SIZE) {
    throw new Error(
      `vault-secrets: root must be exactly ${ROOT_SIZE} bytes, got ${root.length}`,
    );
  }
}

/**
 * Derive the 32-byte `authAnchor` shared across a single Pre-PegIn
 * transaction.
 *
 * `SHA256(authAnchor)` is committed as the OP_RETURN preimage hash in
 * the Pre-PegIn; the raw preimage is revealed to the vault provider's
 * `auth_createDepositorToken` RPC in exchange for a CWT bearer token.
 *
 * @stability frozen — on-chain-binding. Changing the HKDF info encoding
 * (label or argument order) rotates the anchor and invalidates the VP
 * bearer-token flow for existing deposits.
 */
export function expandAuthAnchor(root: Uint8Array): Uint8Array {
  assertRoot(root);
  return hkdfExpand(
    sha256,
    root,
    buildInfo(LABEL_AUTH_ANCHOR),
    AUTH_ANCHOR_SIZE,
  );
}

/**
 * Derive the 32-byte `hashlockSecret` for the HTLC at output index
 * `htlcVout`.
 *
 * `SHA256(hashlockSecret)` is committed as the HTLC taproot hashlock
 * at vout = `htlcVout` in the Pre-PegIn. The raw preimage is revealed
 * on Ethereum via `activateVaultWithSecret`.
 *
 * @stability frozen — on-chain-binding. Changing the HKDF info
 * encoding produces a different secret whose SHA-256 will not match
 * the on-chain hashlock; affected vaults can never be activated.
 */
export function expandHashlockSecret(
  root: Uint8Array,
  htlcVout: number,
): Uint8Array {
  assertRoot(root);
  return hkdfExpand(
    sha256,
    root,
    buildInfo(LABEL_HASHLOCK, i2osp4(htlcVout)),
    HASHLOCK_SIZE,
  );
}

/**
 * Derive the 64-byte `wotsSeed` for the vault at output index
 * `htlcVout`.
 *
 * Fed into the per-vault WOTS block-keypair derivation. Only the
 * `keccak256` hash of the derived public keys appears on-chain
 * (committed as `depositorWotsPkHash`).
 *
 * @stability frozen — on-chain-binding. Changing the HKDF info
 * encoding (label or htlcVout serialization) rotates the seed and
 * therefore the WOTS keys; existing `depositorWotsPkHash` commitments
 * would no longer match. Per-vault domain separation depends on the
 * `i2osp4(htlcVout)` argument: do not change its encoding.
 */
export function expandWotsSeed(root: Uint8Array, htlcVout: number): Uint8Array {
  assertRoot(root);
  return hkdfExpand(
    sha256,
    root,
    buildInfo(LABEL_WOTS_SEED, i2osp4(htlcVout)),
    WOTS_SEED_SIZE,
  );
}
