/**
 * Verify a vault-provider CWT bearer token (RFC 8392) wrapped in a
 * COSE Sign1 envelope (RFC 8152), signed with ES256K by the VP's
 * ephemeral token-signing key.
 *
 * This is the TypeScript port of the btc-vault Rust client verifier
 * (`crates/btc-auth/src/client.rs::validate_token_with_public_key_at_time`
 * plus the response cross-checks from `verify_token_response_at_time`).
 * The FE previously verified only the server-identity proof
 * ({@link ./serverIdentity}) and treated the token itself as an opaque
 * blob; this closes that gap by cryptographically verifying the token
 * and binding its claims to the expected issuer, subject, and depositor.
 *
 * Trust chain: {@link ./serverIdentity} first proves the
 * `ephemeral_pubkey` is attested by the on-chain-pinned server key.
 * This function then verifies the token's COSE signature against that
 * same ephemeral key, so a token that decodes and verifies here is one
 * the pinned VP actually issued.
 *
 * The byte-level expectations (COSE tag, ES256K alg id, Sig_structure
 * layout, CWT registered-claim keys) mirror the issuer's `coset` stack
 * and are pinned by the golden-vector test against a real Rust-issued
 * token.
 *
 * @module tbv/core/clients/vault-provider/auth/verifyDepositorCwt
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { sha256 } from "@noble/hashes/sha2.js";

import {
  COMPRESSED_PUBKEY_HEX_LEN,
  hexToUint8Array,
  stripHexPrefix,
  X_ONLY_PUBKEY_HEX_LEN,
} from "../../../primitives/utils/bitcoin";
import { HEX_RE } from "../../../utils/validation";

import { CborReader, decodeCbor } from "./cborDecode";

/** CWT `sub` value for JSON-RPC-subject tokens (`auth_createDepositorToken`). */
export const CWT_SUBJECT_JSONRPC = "vaultd-jsonrpc";
/** CWT `sub` value for gRPC-subject tokens (`auth_createDepositorTokenGrpc`). */
export const CWT_SUBJECT_GRPC = "vaultd-grpc";

/** CBOR tag wrapping a COSE_Sign1 structure (RFC 8152 §2). */
const COSE_SIGN1_TAG = 18;
/** A COSE_Sign1 is a 4-element array: [protected, unprotected, payload, signature]. */
const COSE_SIGN1_ARRAY_LEN = 4;
/** COSE algorithm id for ES256K (ECDSA w/ secp256k1 + SHA-256), RFC 8812. */
const COSE_ALG_ES256K = -47;
/** COSE header label for the algorithm (RFC 8152 §3.1). */
const COSE_HEADER_LABEL_ALG = 1;
/** ECDSA signature length in COSE compact (r‖s) form. */
const ECDSA_COMPACT_SIG_LEN = 64;

/** CBOR major-type 4 (array) high bits, for the Sig_structure header. */
const CBOR_ARRAY_HEAD = 0x80;
/** CBOR major-type 3 (text string) high bits, for the context string head. */
const CBOR_TEXT_STRING_HEAD = 0x60;
/** CBOR encoding of an empty byte string (major type 2, length 0). */
const CBOR_EMPTY_BYTE_STRING = 0x40;

/** CWT registered claim keys (RFC 8392 §4 / IANA CWT registry). */
const CWT_CLAIM_ISS = 1;
const CWT_CLAIM_SUB = 2;
const CWT_CLAIM_AUD = 3;
const CWT_CLAIM_EXP = 4;
const CWT_CLAIM_NBF = 5;
const CWT_CLAIM_IAT = 6;
const CWT_CLAIM_CTI = 7;

/**
 * Context string for a COSE_Sign1 Sig_structure (RFC 8152 §4.4). 10
 * bytes, so it encodes with a single-byte CBOR text-string head.
 */
const SIG_STRUCTURE_CONTEXT = new TextEncoder().encode("Signature1");

export type CwtVerificationReason =
  | "invalid_input"
  | "invalid_token_structure"
  | "unexpected_algorithm"
  | "signature_verification_failed"
  | "invalid_claims"
  | "issuer_mismatch"
  | "subject_mismatch"
  | "audience_mismatch"
  | "token_not_yet_valid"
  | "token_expired"
  | "expiry_mismatch"
  | "server_identity_expires_before_token";

export class CwtVerificationError extends Error {
  constructor(
    message: string,
    public readonly reason: CwtVerificationReason,
  ) {
    super(message);
    this.name = "CwtVerificationError";
  }
}

export interface VerifyDepositorCwtInput {
  /** Base64url (no padding) COSE Sign1 token from `auth_createDepositorToken`. */
  token: string;
  /**
   * VP ephemeral token-signing pubkey (33-byte compressed hex) from the
   * bundled `server_identity` proof — MUST already be verified by
   * {@link verifyServerIdentity} before being passed here.
   */
  ephemeralPubkeyHex: string;
  /** Pinned VP persistent x-only pubkey (on-chain). Asserted against the token `iss`. */
  expectedIssuerXOnlyPubkey: string;
  /** Expected `sub` — {@link CWT_SUBJECT_JSONRPC} or {@link CWT_SUBJECT_GRPC}. */
  expectedSubject: string;
  /** Depositor x-only pubkey. Asserted against the token `aud`. */
  expectedAudienceXOnlyPubkey: string;
  /** Outer wire `expires_at`. Must equal the token's `exp` exactly. */
  responseExpiresAt: number;
  /** `server_identity.expires_at`. Must be ≥ the token's `exp`. */
  serverIdentityExpiresAt: number;
  /** Current Unix time (seconds). Injected for testability. */
  now: number;
}

export interface VerifiedCwtClaims {
  issuer: string;
  subject: string;
  audience: string;
  expiresAt: number;
  notBefore: number;
  issuedAt: number;
}

/**
 * Verify a depositor CWT and return its claims, or throw
 * {@link CwtVerificationError}.
 *
 * Steps (matching the Rust reference):
 *   1. Decode the COSE Sign1 envelope and assert the protected header
 *      pins ES256K.
 *   2. Verify the ECDSA signature over the reconstructed Sig_structure
 *      against the (already server-identity-verified) ephemeral key.
 *   3. Decode the CWT claims and assert `iss`/`sub`/`aud` bindings,
 *      `nbf`/`exp` validity, `cti` presence, and the outer-vs-inner
 *      expiry cross-checks.
 */
export function verifyDepositorCwt(
  input: VerifyDepositorCwtInput,
): VerifiedCwtClaims {
  const expectedIssuer = normalizeXOnly(
    input.expectedIssuerXOnlyPubkey,
    "expectedIssuerXOnlyPubkey",
  );
  const expectedAudience = normalizeXOnly(
    input.expectedAudienceXOnlyPubkey,
    "expectedAudienceXOnlyPubkey",
  );
  const ephemeral = decodeCompressedPubkey(input.ephemeralPubkeyHex);

  const tokenBytes = base64UrlToBytes(input.token);

  // --- 1. COSE Sign1 structural decode -------------------------------
  // Capture the exact encoded byte ranges of the protected header and
  // payload so the Sig_structure can be rebuilt byte-for-byte from the
  // token's own bytes (any re-encoding risks a non-canonical mismatch).
  const reader = new CborReader(tokenBytes);
  const tag = reader.readHead();
  if (tag.major !== 6 || tag.arg !== COSE_SIGN1_TAG) {
    throw new CwtVerificationError(
      `token is not a COSE Sign1 tagged value (tag ${COSE_SIGN1_TAG})`,
      "invalid_token_structure",
    );
  }
  const array = reader.readHead();
  if (array.major !== 4 || array.arg !== COSE_SIGN1_ARRAY_LEN) {
    throw new CwtVerificationError(
      `COSE Sign1 must be a ${COSE_SIGN1_ARRAY_LEN}-element array`,
      "invalid_token_structure",
    );
  }

  const protectedStart = reader.pos;
  const protectedContent = reader.readByteString();
  const protectedBstr = tokenBytes.subarray(protectedStart, reader.pos);

  // Unprotected header map: present in the envelope but unused here.
  reader.readValue();

  const payloadStart = reader.pos;
  const payloadContent = reader.readByteString();
  const payloadBstr = tokenBytes.subarray(payloadStart, reader.pos);

  const signature = reader.readByteString();
  if (signature.length !== ECDSA_COMPACT_SIG_LEN) {
    throw new CwtVerificationError(
      `COSE signature must be ${ECDSA_COMPACT_SIG_LEN} bytes, got ${signature.length}`,
      "invalid_token_structure",
    );
  }
  // Reject anything after the COSE_Sign1 structure. The bearer we verify
  // must be the exact bytes attached to authenticated calls; a stricter
  // CWT/COSE consumer could interpret trailing bytes differently.
  if (reader.pos !== tokenBytes.length) {
    throw new CwtVerificationError(
      "COSE Sign1 token has trailing bytes after the signature",
      "invalid_token_structure",
    );
  }

  // --- 2a. Algorithm pin --------------------------------------------
  const alg = readProtectedAlgorithm(protectedContent);
  if (alg !== COSE_ALG_ES256K) {
    throw new CwtVerificationError(
      `unexpected COSE algorithm ${alg} (expected ES256K ${COSE_ALG_ES256K})`,
      "unexpected_algorithm",
    );
  }

  // --- 2b. Signature verification -----------------------------------
  const sigStructure = buildSigStructure(protectedBstr, payloadBstr);
  const digest = sha256(sigStructure);
  // strict = true enforces low-S, matching libsecp256k1's `verify_ecdsa`.
  if (!ecc.verify(digest, ephemeral, signature, true)) {
    throw new CwtVerificationError(
      "COSE signature does not verify against the server's ephemeral key",
      "signature_verification_failed",
    );
  }

  // --- 3. Claims -----------------------------------------------------
  const claims = decodeClaims(payloadContent);

  const audience = claims.audience.toLowerCase();
  if (audience.length !== X_ONLY_PUBKEY_HEX_LEN || !HEX_RE.test(audience)) {
    throw new CwtVerificationError(
      "token `aud` is not a 32-byte x-only pubkey hex",
      "invalid_claims",
    );
  }
  if (claims.issuedAt > claims.expiresAt) {
    throw new CwtVerificationError(
      `token iat (${claims.issuedAt}) is after exp (${claims.expiresAt})`,
      "invalid_claims",
    );
  }

  if (claims.issuer.toLowerCase() !== expectedIssuer) {
    throw new CwtVerificationError(
      `token issuer does not match pinned server pubkey: expected ${expectedIssuer}, got ${claims.issuer.toLowerCase()}`,
      "issuer_mismatch",
    );
  }
  if (claims.subject !== input.expectedSubject) {
    throw new CwtVerificationError(
      `token subject mismatch: expected ${input.expectedSubject}, got ${claims.subject}`,
      "subject_mismatch",
    );
  }
  if (audience !== expectedAudience) {
    throw new CwtVerificationError(
      `token audience does not match depositor pubkey: expected ${expectedAudience}, got ${audience}`,
      "audience_mismatch",
    );
  }
  if (claims.notBefore > input.now) {
    throw new CwtVerificationError(
      `token not yet valid: nbf ${claims.notBefore} > now ${input.now}`,
      "token_not_yet_valid",
    );
  }
  // Reject tokens stamped in the future. The Rust reference enforces
  // `iat <= now`; the golden tokens have iat == nbf so the `nbf` check
  // above covers it there, but checking iat explicitly matches the
  // reference exactly (and catches a token with nbf in the past but iat
  // in the future).
  if (claims.issuedAt > input.now) {
    throw new CwtVerificationError(
      `token issued in the future: iat ${claims.issuedAt} > now ${input.now}`,
      "invalid_claims",
    );
  }
  if (claims.expiresAt <= input.now) {
    throw new CwtVerificationError(
      `token expired: exp ${claims.expiresAt} <= now ${input.now}`,
      "token_expired",
    );
  }
  if (input.responseExpiresAt !== claims.expiresAt) {
    throw new CwtVerificationError(
      `response expires_at (${input.responseExpiresAt}) does not equal token exp (${claims.expiresAt})`,
      "expiry_mismatch",
    );
  }
  if (input.serverIdentityExpiresAt < claims.expiresAt) {
    throw new CwtVerificationError(
      `server identity expires (${input.serverIdentityExpiresAt}) before token exp (${claims.expiresAt})`,
      "server_identity_expires_before_token",
    );
  }

  return {
    issuer: claims.issuer,
    subject: claims.subject,
    audience,
    expiresAt: claims.expiresAt,
    notBefore: claims.notBefore,
    issuedAt: claims.issuedAt,
  };
}

/** Read the algorithm label from the COSE protected-header byte string. */
function readProtectedAlgorithm(protectedContent: Uint8Array): number {
  if (protectedContent.length === 0) {
    throw new CwtVerificationError(
      "empty COSE protected header (no algorithm)",
      "unexpected_algorithm",
    );
  }
  const header = decodeCbor(protectedContent);
  if (!(header instanceof Map)) {
    throw new CwtVerificationError(
      "COSE protected header is not a map",
      "invalid_token_structure",
    );
  }
  const alg = header.get(COSE_HEADER_LABEL_ALG);
  if (typeof alg !== "number") {
    throw new CwtVerificationError(
      "COSE protected header missing integer algorithm label",
      "unexpected_algorithm",
    );
  }
  return alg;
}

/**
 * Rebuild the COSE_Sign1 Sig_structure (RFC 8152 §4.4):
 *
 *   [ "Signature1", body_protected (bstr), external_aad = h'' , payload (bstr) ]
 *
 * `body_protected` and `payload` are spliced verbatim from the token's
 * own encoded byte strings, so the result is byte-identical to what the
 * issuer signed regardless of CBOR canonicalization choices.
 */
function buildSigStructure(
  protectedBstr: Uint8Array,
  payloadBstr: Uint8Array,
): Uint8Array {
  return concatBytes(
    Uint8Array.of(CBOR_ARRAY_HEAD | COSE_SIGN1_ARRAY_LEN),
    Uint8Array.of(CBOR_TEXT_STRING_HEAD | SIG_STRUCTURE_CONTEXT.length),
    SIG_STRUCTURE_CONTEXT,
    protectedBstr,
    Uint8Array.of(CBOR_EMPTY_BYTE_STRING),
    payloadBstr,
  );
}

interface DecodedClaims {
  issuer: string;
  subject: string;
  audience: string;
  expiresAt: number;
  notBefore: number;
  issuedAt: number;
}

/** Decode and type-check the CWT registered claims from the payload. */
function decodeClaims(payloadContent: Uint8Array): DecodedClaims {
  const root = decodeCbor(payloadContent);
  if (!(root instanceof Map)) {
    throw new CwtVerificationError(
      "CWT claims root is not a map",
      "invalid_claims",
    );
  }
  const cti = requireBytes(root, CWT_CLAIM_CTI, "cti");
  if (cti.length === 0) {
    throw new CwtVerificationError("token cti is empty", "invalid_claims");
  }
  return {
    issuer: requireString(root, CWT_CLAIM_ISS, "iss"),
    subject: requireString(root, CWT_CLAIM_SUB, "sub"),
    audience: requireString(root, CWT_CLAIM_AUD, "aud"),
    expiresAt: requireTimestamp(root, CWT_CLAIM_EXP, "exp"),
    notBefore: requireTimestamp(root, CWT_CLAIM_NBF, "nbf"),
    issuedAt: requireTimestamp(root, CWT_CLAIM_IAT, "iat"),
  };
}

function requireString(
  claims: Map<unknown, unknown>,
  key: number,
  name: string,
): string {
  const value = claims.get(key);
  if (typeof value !== "string") {
    throw new CwtVerificationError(
      `token claim ${name} is missing or not a text string`,
      "invalid_claims",
    );
  }
  return value;
}

function requireBytes(
  claims: Map<unknown, unknown>,
  key: number,
  name: string,
): Uint8Array {
  const value = claims.get(key);
  if (!(value instanceof Uint8Array)) {
    throw new CwtVerificationError(
      `token claim ${name} is missing or not a byte string`,
      "invalid_claims",
    );
  }
  return value;
}

function requireTimestamp(
  claims: Map<unknown, unknown>,
  key: number,
  name: string,
): number {
  const value = claims.get(key);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new CwtVerificationError(
      `token claim ${name} is missing or not a non-negative integer timestamp`,
      "invalid_claims",
    );
  }
  return value;
}

/** Validate and normalize a 32-byte x-only pubkey to lowercase hex. */
function normalizeXOnly(pubkey: string, label: string): string {
  const normalized = stripHexPrefix(pubkey).toLowerCase();
  if (normalized.length !== X_ONLY_PUBKEY_HEX_LEN || !HEX_RE.test(normalized)) {
    throw new CwtVerificationError(
      `${label} must be 32-byte x-only hex; got ${normalized.length} chars`,
      "invalid_input",
    );
  }
  return normalized;
}

/** Validate a 33-byte compressed pubkey hex and return its bytes. */
function decodeCompressedPubkey(pubkeyHex: string): Uint8Array {
  const normalized = stripHexPrefix(pubkeyHex).toLowerCase();
  const prefix = normalized.slice(0, 2);
  if (
    normalized.length !== COMPRESSED_PUBKEY_HEX_LEN ||
    !HEX_RE.test(normalized) ||
    (prefix !== "02" && prefix !== "03")
  ) {
    throw new CwtVerificationError(
      "ephemeralPubkeyHex must be 33-byte compressed pubkey hex (prefix 02/03)",
      "invalid_input",
    );
  }
  return hexToUint8Array(normalized);
}

const B64URL_LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1);
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  for (let i = 0; i < alphabet.length; i++) {
    table[alphabet.charCodeAt(i)] = i;
  }
  return table;
})();

/** Decode a base64url (no-padding) string to bytes. */
function base64UrlToBytes(input: string): Uint8Array {
  const len = input.length;
  const fullGroups = Math.floor(len / 4);
  const remainder = len % 4;
  if (remainder === 1) {
    throw new CwtVerificationError(
      "invalid base64url length",
      "invalid_token_structure",
    );
  }
  const outLen = fullGroups * 3 + (remainder === 0 ? 0 : remainder - 1);
  const out = new Uint8Array(outLen);

  const sextet = (charCode: number): number => {
    const value = charCode < 128 ? B64URL_LOOKUP[charCode] : -1;
    if (value < 0) {
      throw new CwtVerificationError(
        "invalid base64url character",
        "invalid_token_structure",
      );
    }
    return value;
  };

  let inPos = 0;
  let outPos = 0;
  for (let g = 0; g < fullGroups; g++) {
    const a = sextet(input.charCodeAt(inPos++));
    const b = sextet(input.charCodeAt(inPos++));
    const c = sextet(input.charCodeAt(inPos++));
    const d = sextet(input.charCodeAt(inPos++));
    out[outPos++] = (a << 2) | (b >> 4);
    out[outPos++] = ((b & 0x0f) << 4) | (c >> 2);
    out[outPos++] = ((c & 0x03) << 6) | d;
  }
  if (remainder === 2) {
    const a = sextet(input.charCodeAt(inPos++));
    const b = sextet(input.charCodeAt(inPos++));
    out[outPos++] = (a << 2) | (b >> 4);
  } else if (remainder === 3) {
    const a = sextet(input.charCodeAt(inPos++));
    const b = sextet(input.charCodeAt(inPos++));
    const c = sextet(input.charCodeAt(inPos++));
    out[outPos++] = (a << 2) | (b >> 4);
    out[outPos++] = ((b & 0x0f) << 4) | (c >> 2);
  }
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
