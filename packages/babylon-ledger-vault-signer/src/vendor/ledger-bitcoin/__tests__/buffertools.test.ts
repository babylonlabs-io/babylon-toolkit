/**
 * Boundary tests for the vendored 8-byte-LE amount codec.
 *
 * PSBT amounts ride `unsafeTo64bitLE`/`unsafeFrom64bitLE` (PSBT_OUT_AMOUNT and
 * witness-utxo values), and the pair silently caps at 2^53 − 1 — pin the bound
 * from both directions. The varint/slice paths are exercised transitively by
 * the psbtv2 golden round-trips; the remaining accessors (Int32/UInt64/vector
 * readers) are upstream-faithful surface kept per the vendor manifest and only
 * reachable via bip32-derivation accessors no current flow calls.
 */

import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { unsafeFrom64bitLE, unsafeTo64bitLE } from "../buffertools";

describe("unsafeTo64bitLE / unsafeFrom64bitLE boundaries", () => {
  it.each([0, 1, 0xffffffff, Number.MAX_SAFE_INTEGER])("round-trips %s through the 8-byte LE encoding", (n) => {
    const encoded = unsafeTo64bitLE(n);
    expect(encoded.length).toBe(8);
    expect(unsafeFrom64bitLE(encoded)).toBe(n);
  });

  it("encodes MAX_SAFE_INTEGER (2^53 − 1) little-endian", () => {
    expect(unsafeTo64bitLE(Number.MAX_SAFE_INTEGER).toString("hex")).toBe("ffffffffffff1f00");
  });

  it("rejects encoding a value above MAX_SAFE_INTEGER", () => {
    expect(() => unsafeTo64bitLE(2 ** 53)).toThrow(/non-negative safe integer/);
  });

  it("rejects decoding a value above the 2^53 − 1 bound", () => {
    // byte 7 non-zero
    expect(() => unsafeFrom64bitLE(Buffer.from("0000000000000001", "hex"))).toThrow(/MAX_SAFE_INT/);
    // byte 6 above 0x1f
    expect(() => unsafeFrom64bitLE(Buffer.from("0000000000002000", "hex"))).toThrow(/MAX_SAFE_INT/);
  });

  it("rejects a buffer that is not 8 bytes long", () => {
    expect(() => unsafeFrom64bitLE(Buffer.from("00", "hex"))).toThrow(/length 8/);
  });

  it("rejects negative, fractional, and NaN amounts instead of silently corrupting", () => {
    // Negatives would two's-complement wrap, NaN encodes as zero — amount bytes
    // must never be produced from garbage input.
    expect(() => unsafeTo64bitLE(-1)).toThrow(/non-negative safe integer/);
    expect(() => unsafeTo64bitLE(1.5)).toThrow(/non-negative safe integer/);
    expect(() => unsafeTo64bitLE(Number.NaN)).toThrow(/non-negative safe integer/);
    expect(() => unsafeTo64bitLE(Number.NEGATIVE_INFINITY)).toThrow(/non-negative safe integer/);
  });
});
