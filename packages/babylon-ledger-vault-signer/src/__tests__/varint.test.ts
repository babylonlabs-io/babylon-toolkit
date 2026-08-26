/**
 * `parseVarint` minimality gate — a LOCAL DIVERGENCE from upstream
 * `ledger-bitcoin`, which parse-accepts overlong CompactSize encodings.
 *
 * WHY it is enforced: an overlong length desynchronizes this parser from
 * `bitcoinjs-lib`'s bip174, which advances by the CANONICAL width
 * (`bip174@2.1.1 src/lib/parser/fromBuffer.js:10-11`) while `parseVarint`
 * returns the TRUE wire width — so the same bytes yield two different keypair
 * sets. Full rationale: `../vendor/ledger-bitcoin/README.md`, `varint.ts` bullet.
 *
 * Canonical round-trips across all four widths are covered by
 * `../vendor/ledger-bitcoin/__tests__/varint.golden.test.ts` against the Python
 * oracle's vectors; this file covers the rejection behaviour and the
 * accept/reject boundary that pins it.
 */

import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { createVarint, parseVarint } from "../vendor/ledger-bitcoin/varint";

describe("parseVarint minimality", () => {
  it("rejects a 3-byte varint encoding a value below 0xfd", () => {
    // 252 — one below the smallest value the 0xfd form may carry; fits in 1 byte.
    const overlong = Buffer.from("fdfc00", "hex");
    expect(() => parseVarint(overlong, 0)).toThrow(RangeError);
    expect(() => parseVarint(overlong, 0)).toThrow(/Non-minimal varint/);
  });

  it("rejects a 5-byte varint encoding a value of 0xffff or below", () => {
    // 65535 — the largest value the 3-byte form carries, so the 5-byte form is overlong.
    const overlong = Buffer.from("feffff0000", "hex");
    expect(() => parseVarint(overlong, 0)).toThrow(RangeError);
    expect(() => parseVarint(overlong, 0)).toThrow(/Non-minimal varint/);
  });

  it("rejects a 9-byte varint encoding a value of 0xffffffff or below", () => {
    // 4294967295 — the largest value the 5-byte form carries.
    const overlong = Buffer.from("ffffffffff00000000", "hex");
    expect(() => parseVarint(overlong, 0)).toThrow(RangeError);
    expect(() => parseVarint(overlong, 0)).toThrow(/Non-minimal varint/);
  });

  it("rejects the overlong value length of the bip174 parser-differential keypair", () => {
    // Regression guard for the reported differential: keypair `01fc fd0800 deadbeefcafe0000`
    // — its 8-byte value is prefixed by `fd0800` (8 in the 3-byte form). bip174 advances one
    // byte past that prefix and takes `0800deadbeefcafe`; PsbtV2 advances three and takes
    // `deadbeefcafe0000`. Parsed at the value-length offset, where the two parsers diverge.
    const keypair = Buffer.from("01fc" + "fd0800" + "deadbeefcafe0000", "hex");
    expect(() => parseVarint(keypair, 2)).toThrow(/Non-minimal varint/);
  });

  it("accepts 253, the minimal value of the 3-byte width", () => {
    expect(createVarint(253n).toString("hex")).toBe("fdfd00");
    expect(parseVarint(Buffer.from("fdfd00", "hex"), 0)).toEqual([253n, 3]);
  });

  it("accepts 65536, the minimal value of the 5-byte width", () => {
    expect(createVarint(65536n).toString("hex")).toBe("fe00000100");
    expect(parseVarint(Buffer.from("fe00000100", "hex"), 0)).toEqual([65536n, 5]);
  });

  it("accepts 4294967296, the minimal value of the 9-byte width", () => {
    expect(createVarint(4294967296n).toString("hex")).toBe("ff0000000001000000");
    expect(parseVarint(Buffer.from("ff0000000001000000", "hex"), 0)).toEqual([4294967296n, 9]);
  });
});
