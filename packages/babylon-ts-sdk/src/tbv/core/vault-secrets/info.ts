/**
 * Info encoding for HKDF-Expand per `derive-vault-secrets.md` Appendix A.
 *
 * ```
 * info(label, ctx) :=
 *        "babylonvault"           // fixed 12-byte ASCII domain tag
 *     || I2OSP(len(label), 1)     // 1-byte label length
 *     || label                    // ASCII bytes of the label
 *     || I2OSP(len(ctx),   2)     // 2-byte big-endian ctx length
 *     || ctx                      // opaque per-label context bytes
 * ```
 *
 * The fixed-width length prefixes make the encoding injective over the
 * set of legal `(label, ctx)` pairs, which is what lets distinct labels
 * produce computationally-independent HKDF-Expand outputs under the
 * HMAC-SHA-256 PRF assumption.
 *
 * @module vault-secrets/info
 */

const DOMAIN_TAG_BYTES = new TextEncoder().encode("babylonvault");

/** Max label length (1-byte prefix). */
const MAX_LABEL_LEN = 0xff;

/** Max ctx length (2-byte prefix). */
const MAX_CTX_LEN = 0xffff;

/** Size of the ctx length prefix in bytes. */
const CTX_LEN_PREFIX_SIZE = 2;

/**
 * @internal Label for the per-HTLC hashlock preimage (Appendix A §A.2).
 * Exported only so the spec-conformance tests can pin the literal value.
 */
export const LABEL_HASHLOCK = "hashlock";

/**
 * @internal Label for the per-Pre-PegIn shared auth-anchor (Appendix A §A.2).
 * Exported only so the spec-conformance tests can pin the literal value.
 */
export const LABEL_AUTH_ANCHOR = "auth-anchor";

/**
 * @internal Label for the per-HTLC WOTS block-derivation seed (Appendix A §A.2).
 * Exported only so the spec-conformance tests can pin the literal value.
 */
export const LABEL_WOTS_SEED = "wots-seed";

/**
 * Encode a 32-bit unsigned integer as 4 big-endian bytes (RFC 8017 §4.1,
 * `I2OSP(n, 4)`).
 *
 * @internal Helper used by `buildInfo` and the per-HTLC `expand*`
 * functions; consumed directly only by tests.
 *
 * @throws If `value` is not a non-negative integer ≤ `0xffffffff`.
 */
export function i2osp4(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`i2osp4: value must be a u32, got ${value}`);
  }
  const out = new Uint8Array(4);
  out[0] = (value >>> 24) & 0xff;
  out[1] = (value >>> 16) & 0xff;
  out[2] = (value >>> 8) & 0xff;
  out[3] = value & 0xff;
  return out;
}

/**
 * Build the `info` byte-string for an HKDF-Expand invocation.
 *
 * @internal Used by the per-HTLC `expand*` functions; exposed for the
 * spec-conformance tests that pin the encoded byte layout.
 *
 * @param label - ASCII label tag. Length MUST be in `[1, 255]`.
 * @param ctx   - Optional opaque context bytes. Length MUST be in `[0, 65535]`.
 */
export function buildInfo(
  label: string,
  ctx: Uint8Array = new Uint8Array(0),
): Uint8Array {
  const labelBytes = new TextEncoder().encode(label);

  if (labelBytes.length === 0 || labelBytes.length > MAX_LABEL_LEN) {
    throw new Error(
      `info: label length must be in [1, ${MAX_LABEL_LEN}], got ${labelBytes.length}`,
    );
  }
  if (ctx.length > MAX_CTX_LEN) {
    throw new Error(
      `info: ctx length must be in [0, ${MAX_CTX_LEN}], got ${ctx.length}`,
    );
  }

  const total =
    DOMAIN_TAG_BYTES.length +
    1 +
    labelBytes.length +
    CTX_LEN_PREFIX_SIZE +
    ctx.length;

  const out = new Uint8Array(total);
  let offset = 0;

  out.set(DOMAIN_TAG_BYTES, offset);
  offset += DOMAIN_TAG_BYTES.length;

  out[offset] = labelBytes.length;
  offset += 1;

  out.set(labelBytes, offset);
  offset += labelBytes.length;

  // I2OSP(len, 2) big-endian
  out[offset] = (ctx.length >>> 8) & 0xff;
  out[offset + 1] = ctx.length & 0xff;
  offset += CTX_LEN_PREFIX_SIZE;

  out.set(ctx, offset);

  return out;
}
