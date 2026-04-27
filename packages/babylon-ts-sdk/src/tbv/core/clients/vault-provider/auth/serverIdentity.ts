/**
 * Server-identity verification for the vault provider's
 * `auth_createDepositorToken` response.
 *
 * The VP returns a `ServerIdentityResponse` bundled with every issued
 * token:
 *
 *   - `server_pubkey`:    VP's persistent x-only pubkey (HEX, 32B)
 *   - `ephemeral_pubkey`: VP's ephemeral token-signing key (HEX, 33B compressed)
 *   - `expires_at`:       Unix timestamp when the ephemeral key expires
 *   - `signature`:        BIP-322 signature by the persistent key over
 *                         `(SERVER_IDENTITY_DOMAIN, ephemeral_pubkey, expires_at)`
 *
 * The FE pins `server_pubkey` against the on-chain `VaultProvider.btcPubKey`
 * it reads from the registry contract. A mismatch rejects the token.
 *
 * @module tbv/core/clients/vault-provider/auth/serverIdentity
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";

import {
  COMPRESSED_PUBKEY_HEX_LEN,
  SCHNORR_SIG_HEX_LEN,
  stripHexPrefix,
  X_ONLY_PUBKEY_HEX_LEN,
} from "../../../primitives/utils/bitcoin";
import { HEX_RE } from "../../../utils/validation";

import { verifyBip322Simple } from "./bip322Verify";
import { encodeServerIdentityPayload } from "./cbor";

/**
 * Byte-string domain the btc-vault Rust reference passes as the first
 * element of the CBOR tuple signed over for server-identity proofs.
 * Must match `SERVER_IDENTITY_DOMAIN` in
 * `btc-vault/crates/btc-auth/src/server_identity.rs`.
 */
const SERVER_IDENTITY_DOMAIN = new TextEncoder().encode(
  "btc-auth.server-identity.v1",
);

/**
 * Wire representation from btc-vault's `ServerIdentityResponse`.
 */
export interface ServerIdentityResponse {
  /** Hex-encoded x-only (32-byte) persistent server pubkey. */
  server_pubkey: string;
  /** Hex-encoded compressed (33-byte) ephemeral token-signing pubkey. */
  ephemeral_pubkey: string;
  /** Unix timestamp at which the ephemeral key expires. */
  expires_at: number;
  /** Hex-encoded 64-byte BIP-322 Schnorr signature. */
  signature: string;
}

export interface VerifyServerIdentityInput {
  /** The proof returned by `auth_createDepositorToken`. */
  proof: ServerIdentityResponse;
  /**
   * The x-only persistent server pubkey the FE expects (sourced from
   * the on-chain `VaultProvider.btcPubKey` via the vault registry
   * reader). 64-char lowercase hex, no `0x` prefix.
   */
  pinnedServerPubkey: string;
  /** Current Unix timestamp in seconds. Injected for testability. */
  now: number;
}

export class ServerIdentityError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | "pinned_pubkey_mismatch"
      | "expired"
      | "invalid_expires_at"
      | "invalid_pubkey_encoding"
      | "invalid_ephemeral_pubkey"
      | "invalid_signature_encoding"
      | "signature_verification_failed",
  ) {
    super(message);
    this.name = "ServerIdentityError";
  }
}

/** Parse a lowercase-hex string to bytes. Expects even length, already validated. */
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}


/**
 * Verify a server identity proof against a pinned server pubkey.
 *
 * Checks:
 *   1. `server_pubkey` matches the pin.
 *   2. `expires_at > now` (with integer guards).
 *   3. `ephemeral_pubkey` is a well-formed 33-byte compressed pubkey.
 *   4. `signature` is a well-formed 64-byte Schnorr hex string.
 *   5. The BIP-322 Schnorr signature cryptographically verifies
 *      against `server_pubkey` over the CBOR-encoded tuple
 *      `(SERVER_IDENTITY_DOMAIN, ephemeral_pubkey, expires_at)`.
 *
 * Step 5 is what actually binds the ephemeral key to the persistent
 * pubkey — without it, a TLS-MITM attacker who reads the pinned
 * pubkey from the on-chain registry could substitute an arbitrary
 * ephemeral pubkey paired with any lexically-valid signature.
 *
 * @throws ServerIdentityError on any validation failure.
 */
export function verifyServerIdentity(input: VerifyServerIdentityInput): void {
  const { proof, pinnedServerPubkey, now } = input;

  const pinned = stripHexPrefix(pinnedServerPubkey).toLowerCase();
  if (pinned.length !== X_ONLY_PUBKEY_HEX_LEN || !HEX_RE.test(pinned)) {
    throw new ServerIdentityError(
      `pinnedServerPubkey must be 32-byte hex; got ${pinned.length} chars`,
      "invalid_pubkey_encoding",
    );
  }

  const actual = stripHexPrefix(proof.server_pubkey).toLowerCase();
  if (actual.length !== X_ONLY_PUBKEY_HEX_LEN || !HEX_RE.test(actual)) {
    throw new ServerIdentityError(
      `server_pubkey must be 32-byte hex; got ${actual.length} chars`,
      "invalid_pubkey_encoding",
    );
  }

  if (actual !== pinned) {
    throw new ServerIdentityError(
      `server_pubkey does not match pinned value: expected ${pinned}, got ${actual}`,
      "pinned_pubkey_mismatch",
    );
  }

  // Validate both sides of the comparison are well-formed integers
  // BEFORE comparing — untrusted JSON-RPC input can supply
  // undefined/NaN/string values for `expires_at`, and relational
  // comparisons with those silently evaluate to `false` (accepting the
  // proof). Caller's `now` is injected but we still sanity-check it.
  // Garbage data and "valid but past" both render the proof unusable
  // but mean different things to a caller — keep the reasons distinct.
  if (!Number.isSafeInteger(proof.expires_at)) {
    throw new ServerIdentityError(
      `expires_at must be a finite integer; got ${JSON.stringify(proof.expires_at)}`,
      "invalid_expires_at",
    );
  }
  if (!Number.isSafeInteger(now)) {
    throw new ServerIdentityError(
      `now must be a finite integer; got ${JSON.stringify(now)}`,
      "invalid_expires_at",
    );
  }
  if (proof.expires_at <= now) {
    throw new ServerIdentityError(
      `server identity proof expired at ${proof.expires_at}, now ${now}`,
      "expired",
    );
  }

  const eph = stripHexPrefix(proof.ephemeral_pubkey).toLowerCase();
  if (eph.length !== COMPRESSED_PUBKEY_HEX_LEN || !HEX_RE.test(eph)) {
    throw new ServerIdentityError(
      `ephemeral_pubkey must be 33-byte compressed hex; got ${eph.length} chars`,
      "invalid_ephemeral_pubkey",
    );
  }
  const prefix = eph.slice(0, 2);
  if (prefix !== "02" && prefix !== "03") {
    throw new ServerIdentityError(
      `ephemeral_pubkey must be compressed (prefix 02/03); got ${prefix}`,
      "invalid_ephemeral_pubkey",
    );
  }
  // Curve validation. The BIP-322 signature attests to the byte string
  // of `ephemeral_pubkey` only, not to its curve validity. Without
  // this check, a server could sign a structurally-valid byte string
  // that doesn't decode to a secp256k1 point — passing verification
  // here and surfacing as an obscure crypto error later when the
  // depositor tries to use the key. Reject up front.
  const ephBytes = hexToBytes(eph);
  if (!ecc.isPoint(ephBytes)) {
    throw new ServerIdentityError(
      "ephemeral_pubkey is not a valid secp256k1 point",
      "invalid_ephemeral_pubkey",
    );
  }

  const sig = stripHexPrefix(proof.signature).toLowerCase();
  if (sig.length !== SCHNORR_SIG_HEX_LEN || !HEX_RE.test(sig)) {
    throw new ServerIdentityError(
      `signature must be 64-byte Schnorr hex; got ${sig.length} chars`,
      "invalid_signature_encoding",
    );
  }

  // Cryptographic verification of the BIP-322 signature over the
  // CBOR-encoded payload. Without this, the ephemeral-key binding is
  // unenforced and a TLS-MITM could substitute a fake ephemeral key
  // alongside the real (publicly-readable) pinned pubkey.
  const payload = encodeServerIdentityPayload(
    SERVER_IDENTITY_DOMAIN,
    hexToBytes(eph),
    proof.expires_at,
  );
  const verified = verifyBip322Simple(payload, hexToBytes(actual), hexToBytes(sig));
  if (!verified) {
    throw new ServerIdentityError(
      "BIP-322 signature verification failed — ephemeral key is not attested by pinned server pubkey",
      "signature_verification_failed",
    );
  }
}
