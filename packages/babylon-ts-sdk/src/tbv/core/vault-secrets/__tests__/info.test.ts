/**
 * Tests for the `info(label, ctx)` encoder per
 * `derive-vault-secrets.md` Appendix A.
 *
 * The golden hex strings below come from §4 "Label info encodings".
 */

import { describe, expect, it } from "vitest";

import {
  LABEL_AUTH_ANCHOR,
  LABEL_HASHLOCK,
  LABEL_WOTS_SEED,
  buildInfo,
  i2osp4,
} from "../info";

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

describe("i2osp4", () => {
  it("encodes small values as big-endian 4 bytes", () => {
    expect(toHex(i2osp4(0))).toBe("00000000");
    expect(toHex(i2osp4(1))).toBe("00000001");
    expect(toHex(i2osp4(2))).toBe("00000002");
  });

  it("encodes max u32", () => {
    expect(toHex(i2osp4(0xffffffff))).toBe("ffffffff");
  });

  it("rejects negatives and non-integers", () => {
    expect(() => i2osp4(-1)).toThrow();
    expect(() => i2osp4(1.5)).toThrow();
    expect(() => i2osp4(0x1_0000_0000)).toThrow();
  });
});

describe("buildInfo — golden vectors from derive-vault-secrets.md §4", () => {
  it("encodes auth-anchor with empty ctx", () => {
    // "babylonvault" || 0b || "auth-anchor" || 00 00
    const expected =
      "62616279" +
      "6c6f6e76" +
      "61756c74" +
      "0b" +
      "617574682d616e63686f72" +
      "0000";
    expect(toHex(buildInfo(LABEL_AUTH_ANCHOR))).toBe(expected);
  });

  it("encodes hashlock with htlcVout = 0", () => {
    // "babylonvault" || 08 || "hashlock" || 00 04 || 00 00 00 00
    const expected =
      "62616279" +
      "6c6f6e76" +
      "61756c74" +
      "08" +
      "686173686c6f636b" +
      "0004" +
      "00000000";
    expect(toHex(buildInfo(LABEL_HASHLOCK, i2osp4(0)))).toBe(expected);
  });

  it("encodes wots-seed with htlcVout = 0", () => {
    // "babylonvault" || 09 || "wots-seed" || 00 04 || 00 00 00 00
    const expected =
      "62616279" +
      "6c6f6e76" +
      "61756c74" +
      "09" +
      "776f74732d73656564" +
      "0004" +
      "00000000";
    expect(toHex(buildInfo(LABEL_WOTS_SEED, i2osp4(0)))).toBe(expected);
  });

  it("encodes hashlock with htlcVout = 2", () => {
    const expected =
      "62616279" +
      "6c6f6e76" +
      "61756c74" +
      "08" +
      "686173686c6f636b" +
      "0004" +
      "00000002";
    expect(toHex(buildInfo(LABEL_HASHLOCK, i2osp4(2)))).toBe(expected);
  });
});

describe("buildInfo — input validation", () => {
  it("rejects empty label", () => {
    expect(() => buildInfo("")).toThrow(/label length/);
  });

  it("rejects label longer than 255 bytes", () => {
    expect(() => buildInfo("x".repeat(256))).toThrow(/label length/);
  });

  it("accepts label of exactly 255 bytes", () => {
    expect(() => buildInfo("x".repeat(255))).not.toThrow();
  });

  it("rejects ctx longer than 65535 bytes", () => {
    expect(() => buildInfo("test", new Uint8Array(65536))).toThrow(
      /ctx length/,
    );
  });

  it("accepts empty ctx", () => {
    expect(() => buildInfo("test")).not.toThrow();
    expect(() => buildInfo("test", new Uint8Array(0))).not.toThrow();
  });
});

describe("buildInfo — injectivity", () => {
  it("labels with shared prefix produce distinct encodings", () => {
    const a = buildInfo("hashlock");
    const b = buildInfo("hashlock-v2");
    expect(toHex(a)).not.toBe(toHex(b));
    // Label-length byte differs first
    expect(a[12]).not.toBe(b[12]);
  });

  it("same label with empty ctx vs 4-byte-zero ctx produces distinct encodings", () => {
    const a = buildInfo(LABEL_HASHLOCK);
    const b = buildInfo(LABEL_HASHLOCK, i2osp4(0));
    expect(toHex(a)).not.toBe(toHex(b));
  });

  it("same label with different ctx values produces distinct encodings", () => {
    const a = buildInfo(LABEL_HASHLOCK, i2osp4(0));
    const b = buildInfo(LABEL_HASHLOCK, i2osp4(1));
    expect(toHex(a)).not.toBe(toHex(b));
  });
});
