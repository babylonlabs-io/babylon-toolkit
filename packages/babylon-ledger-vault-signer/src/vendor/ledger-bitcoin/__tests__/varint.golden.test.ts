/**
 * Golden-vector tests for the vendored Bitcoin varint codec.
 *
 * Vectors are `ledger_bitcoin.common.write_varint` output (the Python client the
 * vault firmware's own tests drive SIGN_PSBT through) — see the vendor
 * `README.md` for provenance. The 8-byte-range values (2^64-1 etc.) exceed
 * JS's safe-integer range, so the expected bigint is derived from the exact
 * `hex` by an independent little-endian decoder, not the lossy JSON `value`.
 */

import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { createVarint, parseVarint } from "../varint";
import varintVectors from "./vectors/varint.json";

/** Independent reference decoder — deliberately not the production parseVarint. */
function refDecodeVarint(hex: string): bigint {
  const bytes = Buffer.from(hex, "hex");
  const first = bytes[0]!;
  if (first < 0xfd) return BigInt(first);
  const size = first === 0xfd ? 2 : first === 0xfe ? 4 : 8;
  let value = 0n;
  for (let i = 0; i < size; i++) value += BigInt(bytes[1 + i]!) << BigInt(8 * i);
  return value;
}

describe("varint golden vectors", () => {
  it.each(varintVectors.vectors)("round-trips $value ($hex)", ({ value, hex }) => {
    const expected = refDecodeVarint(hex);

    // For values within JS's safe range, the generator's declared `value` ties
    // the independent decoder to the oracle output.
    if (Number.isSafeInteger(value)) {
      expect(expected).toBe(BigInt(value));
    }

    expect(createVarint(expected).toString("hex")).toBe(hex);
    expect(parseVarint(Buffer.from(hex, "hex"), 0)).toEqual([expected, hex.length / 2]);
  });

  it("rejects a negative value and one above the 64-bit ceiling", () => {
    expect(() => createVarint(-1)).toThrow();
    expect(() => createVarint(1n << 64n)).toThrow(/Too large/);
  });

  it("rejects a negative parse offset", () => {
    expect(() => parseVarint(Buffer.from("00", "hex"), -1)).toThrow(/Negative offset/);
  });

  it("honours a non-zero offset — reads the varint embedded mid-buffer", () => {
    // The production use: a varint embedded inside a serialized PSBT. Prefix +
    // 3-byte varint(253) + trailing; parse at the offset and leave the rest.
    const buf = Buffer.from("aabb" + "fdfd00" + "ccdd", "hex");
    expect(parseVarint(buf, 2)).toEqual([253n, 3]);
    // A different value at a different offset, to pin the arithmetic.
    const buf2 = Buffer.from("00" + "fe00000100" + "ff", "hex");
    expect(parseVarint(buf2, 1)).toEqual([65536n, 5]);
  });

  it("throws on a truncated multi-byte varint", () => {
    expect(() => parseVarint(Buffer.from("fd", "hex"), 0)).toThrow(/Buffer too small/);
  });

  it("rejects a negative bigint", () => {
    expect(() => createVarint(-1n)).toThrow();
  });
});
