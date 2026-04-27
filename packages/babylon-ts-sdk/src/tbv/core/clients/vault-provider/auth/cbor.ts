/**
 * Minimal CBOR encoder for the server-identity payload shape.
 *
 * We only need to encode one specific CBOR structure — the 3-tuple
 * `(SERVER_IDENTITY_DOMAIN, ephemeral_pubkey_bytes, expires_at_u64)` —
 * byte-for-byte identical to what the Rust `ciborium` crate produces
 * for the corresponding tuple, because that's the exact message the
 * VP signs with BIP-322.
 *
 * IMPORTANT encoding quirk: the Rust side passes the domain and
 * pubkey as `&[u8]` / `Vec<u8>` without a `#[serde(with = "serde_bytes")]`
 * attribute, so serde/ciborium encodes them as **CBOR arrays of u8**
 * (major type 4, one item per byte) — NOT as CBOR byte strings (major
 * type 2). A naive byte-string encoding would produce the wrong bytes
 * and signature verification would fail.
 *
 * Rather than pull in a full CBOR dependency for this one shape, we
 * implement the exact subset inline (~40 LOC) and pin it with golden
 * vectors against the Rust reference output.
 *
 * @module tbv/core/clients/vault-provider/auth/cbor
 */

/**
 * Encode a small CBOR unsigned-integer "head" byte for major type
 * `major` (0..7) with argument `arg` (0..2^64-1).
 *
 * Returns the header bytes; the caller concatenates any trailing data
 * (e.g. array elements). Encoding rules:
 *   arg < 24         → single byte `(major << 5) | arg`
 *   arg < 256        → `(major << 5) | 24` + 1-byte arg
 *   arg < 65536      → `(major << 5) | 25` + 2-byte BE arg
 *   arg < 2^32       → `(major << 5) | 26` + 4-byte BE arg
 *   arg < 2^64       → `(major << 5) | 27` + 8-byte BE arg
 */
function cborHead(major: number, arg: number | bigint): Uint8Array {
  const tag = (major & 0x07) << 5;
  const n = typeof arg === "bigint" ? arg : BigInt(arg);
  if (n < 0n) throw new Error("cborHead: negative argument");

  if (n < 24n) return new Uint8Array([tag | Number(n)]);
  if (n < 0x100n) return new Uint8Array([tag | 24, Number(n)]);
  if (n < 0x10000n) {
    const v = Number(n);
    return new Uint8Array([tag | 25, (v >>> 8) & 0xff, v & 0xff]);
  }
  if (n < 0x1_0000_0000n) {
    const v = Number(n);
    return new Uint8Array([
      tag | 26,
      (v >>> 24) & 0xff,
      (v >>> 16) & 0xff,
      (v >>> 8) & 0xff,
      v & 0xff,
    ]);
  }
  // 8-byte BE for u64 range
  const out = new Uint8Array(9);
  out[0] = tag | 27;
  for (let i = 7; i >= 0; i--) {
    out[1 + i] = Number(n >> BigInt((7 - i) * 8)) & 0xff;
  }
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * Encode a `Vec<u8>` / `&[u8]` the way ciborium does by default — as a
 * CBOR array of u8 (major type 4), one element per byte.
 *
 * Each byte becomes a CBOR unsigned integer (major type 0): bytes
 * < 24 are encoded as single bytes, bytes 24..255 as `0x18 XX`.
 */
function encodeBytesAsArrayOfU8(bytes: Uint8Array): Uint8Array {
  const header = cborHead(4, bytes.length);
  const items: Uint8Array[] = [header];
  for (const b of bytes) {
    items.push(cborHead(0, b));
  }
  return concat(...items);
}

/**
 * Encode the server-identity payload the Rust side signs:
 *
 *     ciborium::into_writer(
 *       &(SERVER_IDENTITY_DOMAIN, ephemeral_pubkey.serialize().to_vec(), expires_at),
 *       buf
 *     )
 *
 * Output bytes are byte-for-byte identical to the Rust reference,
 * pinned by the golden vector in the corresponding test file.
 *
 * @param domain - Must be `"btc-auth.server-identity.v1"` (27 bytes)
 *                 — the constant from btc-vault's `server_identity.rs`.
 * @param ephemeralPubkeyCompressed - 33-byte SEC1-compressed pubkey.
 * @param expiresAt - Unix timestamp (seconds). Must be a safe integer.
 */
export function encodeServerIdentityPayload(
  domain: Uint8Array,
  ephemeralPubkeyCompressed: Uint8Array,
  expiresAt: number,
): Uint8Array {
  if (!Number.isSafeInteger(expiresAt) || expiresAt < 0) {
    throw new Error(
      `encodeServerIdentityPayload: expires_at must be a non-negative safe integer, got ${expiresAt}`,
    );
  }
  const arrayHeader = cborHead(4, 3); // 3-tuple encoded as array of 3
  const domainBytes = encodeBytesAsArrayOfU8(domain);
  const pubkeyBytes = encodeBytesAsArrayOfU8(ephemeralPubkeyCompressed);
  const expiresAtBytes = cborHead(0, expiresAt);
  return concat(arrayHeader, domainBytes, pubkeyBytes, expiresAtBytes);
}
