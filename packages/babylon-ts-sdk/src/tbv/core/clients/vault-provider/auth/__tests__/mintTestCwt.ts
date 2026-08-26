/**
 * Test-only minter for ES256K COSE Sign1 CWT bearer tokens.
 *
 * The genuine golden vectors in {@link ./goldenVectors} are signed by the
 * Rust issuer's key, so they can only exercise the *happy* path and the
 * checks that run before signature verification. The claim-rejection
 * paths (`invalid_claims` for a malformed `aud`, `iat > exp`, an empty
 * `cti`, …) run only *after* the COSE signature verifies, so reaching
 * them needs a token signed over deliberately-bad claims.
 *
 * This helper signs tokens with a test-controlled key and hands the
 * matching ephemeral pubkey to the verifier, so any claim combination can
 * be minted with a signature that genuinely verifies. It builds the same
 * COSE_Sign1 byte layout the verifier reads — tag(18), 4-element array,
 * protected-header byte string, empty unprotected map, payload byte
 * string, and the 64-byte compact signature.
 *
 * @module tbv/core/clients/vault-provider/auth/__tests__/mintTestCwt
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { sha256 } from "@noble/hashes/sha2.js";

/** Deterministic, non-zero test scalar — valid private key, not a secret. */
const TEST_PRIVATE_KEY = new Uint8Array(32).fill(0x11);

/** Compressed ephemeral pubkey matching {@link TEST_PRIVATE_KEY}. */
export const MINT_EPHEMERAL_PUBKEY_COMPRESSED = (() => {
  const point = ecc.pointFromScalar(TEST_PRIVATE_KEY, true);
  if (!point) throw new Error("mintTestCwt: invalid test private key");
  return Buffer.from(point).toString("hex");
})();

/** COSE algorithm id for ES256K (the value the verifier requires). */
export const ALG_ES256K = -47;

function cborHead(major: number, arg: number): Uint8Array {
  const tag = (major & 0x07) << 5;
  if (arg < 24) return Uint8Array.of(tag | arg);
  if (arg < 0x100) return Uint8Array.of(tag | 24, arg);
  if (arg < 0x10000) return Uint8Array.of(tag | 25, (arg >> 8) & 0xff, arg & 0xff);
  return Uint8Array.of(
    tag | 26,
    (arg >>> 24) & 0xff,
    (arg >> 16) & 0xff,
    (arg >> 8) & 0xff,
    arg & 0xff,
  );
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** CBOR unsigned integer (major 0). */
function uint(n: number): Uint8Array {
  return cborHead(0, n);
}

/** CBOR negative integer (major 1): encodes -1 - arg. */
function nint(n: number): Uint8Array {
  return cborHead(1, -1 - n);
}

/** CBOR byte string (major 2). */
function bstr(bytes: Uint8Array): Uint8Array {
  return concat(cborHead(2, bytes.length), bytes);
}

/** CBOR text string (major 3). */
function tstr(text: string): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  return concat(cborHead(3, bytes.length), bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface MintCwtOptions {
  alg?: number;
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  nbf: number;
  iat: number;
  /** `cti` bytes; defaults to a single non-zero byte. */
  cti?: Uint8Array;
  /**
   * Override the signature length. The genuine signature is always
   * computed; when set, it is truncated/padded to this length so the
   * verifier's structural length check can be exercised.
   */
  sigLenOverride?: number;
}

/** Build a base64url COSE Sign1 CWT signed with the test ephemeral key. */
export function mintTestCwt(opts: MintCwtOptions): string {
  const protectedContent = concat(
    cborHead(5, 1), // map(1)
    uint(1), // COSE header label: alg
    nint(opts.alg ?? ALG_ES256K),
  );

  const cti = opts.cti ?? Uint8Array.of(0x01);
  const payloadContent = concat(
    cborHead(5, 7), // map(7) — the seven registered CWT claims
    uint(1),
    tstr(opts.iss),
    uint(2),
    tstr(opts.sub),
    uint(3),
    tstr(opts.aud),
    uint(4),
    uint(opts.exp),
    uint(5),
    uint(opts.nbf),
    uint(6),
    uint(opts.iat),
    uint(7),
    bstr(cti),
  );

  const protectedBstr = bstr(protectedContent);
  const payloadBstr = bstr(payloadContent);

  // Sig_structure (RFC 8152 §4.4): array(4) of ["Signature1", protected,
  // external_aad = h'', payload], matching the verifier's reconstruction.
  const sigStructure = concat(
    Uint8Array.of(0x84),
    tstr("Signature1"),
    protectedBstr,
    Uint8Array.of(0x40), // empty external_aad byte string
    payloadBstr,
  );
  const digest = sha256(sigStructure);
  let signature = ecc.sign(digest, TEST_PRIVATE_KEY);
  if (opts.sigLenOverride !== undefined) {
    const resized = new Uint8Array(opts.sigLenOverride);
    resized.set(signature.subarray(0, opts.sigLenOverride));
    signature = resized;
  }

  const token = concat(
    cborHead(6, 18), // tag(18) — COSE_Sign1
    Uint8Array.of(0x84), // array(4)
    protectedBstr,
    Uint8Array.of(0xa0), // unprotected: empty map
    payloadBstr,
    bstr(signature),
  );
  return base64UrlEncode(token);
}
