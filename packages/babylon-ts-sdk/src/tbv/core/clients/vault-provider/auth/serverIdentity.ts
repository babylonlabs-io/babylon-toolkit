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

import {
  COMPRESSED_PUBKEY_HEX_LEN,
  SCHNORR_SIG_HEX_LEN,
  stripHexPrefix,
  X_ONLY_PUBKEY_HEX_LEN,
} from "../../../primitives/utils/bitcoin";
import { HEX_RE } from "../../../utils/validation";

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
      | "invalid_pubkey_encoding"
      | "invalid_ephemeral_pubkey"
      | "invalid_signature_encoding",
  ) {
    super(message);
    this.name = "ServerIdentityError";
  }
}


/**
 * Verify a server identity proof against a pinned server pubkey.
 *
 * Checks: (1) `server_pubkey` matches the pin; (2) `expires_at > now`;
 * (3) `ephemeral_pubkey` is a well-formed 33-byte compressed pubkey;
 * (4) `signature` is a well-formed 64-byte hex string.
 *
 * Full BIP-322 signature verification is deferred to a follow-up.
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
  if (!Number.isSafeInteger(proof.expires_at)) {
    throw new ServerIdentityError(
      `expires_at must be a finite integer; got ${JSON.stringify(proof.expires_at)}`,
      "expired",
    );
  }
  if (!Number.isSafeInteger(now)) {
    throw new ServerIdentityError(
      `now must be a finite integer; got ${JSON.stringify(now)}`,
      "expired",
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

  const sig = stripHexPrefix(proof.signature).toLowerCase();
  if (sig.length !== SCHNORR_SIG_HEX_LEN || !HEX_RE.test(sig)) {
    throw new ServerIdentityError(
      `signature must be 64-byte Schnorr hex; got ${sig.length} chars`,
      "invalid_signature_encoding",
    );
  }

  // TODO: add full BIP-322 sig verify.
}
