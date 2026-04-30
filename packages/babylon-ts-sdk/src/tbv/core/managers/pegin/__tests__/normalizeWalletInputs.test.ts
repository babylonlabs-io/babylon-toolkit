import { describe, expect, it } from "vitest";

import {
  normalizePopSignature,
  normalizeXOnlyPubkey,
} from "../normalizeWalletInputs";

const X_ONLY_LOWER =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const X_ONLY_UPPER =
  "79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798";
const COMPRESSED_PUBKEY =
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

describe("normalizeXOnlyPubkey", () => {
  it("passes through 64-char x-only hex unchanged", () => {
    expect(normalizeXOnlyPubkey(X_ONLY_LOWER)).toBe(X_ONLY_LOWER);
  });

  it("lowercases uppercase x-only hex so downstream equality checks succeed", () => {
    expect(normalizeXOnlyPubkey(X_ONLY_UPPER)).toBe(X_ONLY_LOWER);
  });

  it("strips the parity byte from compressed SEC1 pubkeys", () => {
    expect(normalizeXOnlyPubkey(COMPRESSED_PUBKEY)).toBe(X_ONLY_LOWER);
  });

  it("strips a leading 0x prefix", () => {
    expect(normalizeXOnlyPubkey(`0x${X_ONLY_LOWER}`)).toBe(X_ONLY_LOWER);
  });

  it("throws on empty string", () => {
    expect(() => normalizeXOnlyPubkey("")).toThrow(
      /BTC wallet returned empty public key/,
    );
  });

  it("throws on non-string input", () => {
    expect(() => normalizeXOnlyPubkey(undefined)).toThrow(
      /BTC wallet returned empty public key/,
    );
    expect(() => normalizeXOnlyPubkey(null)).toThrow(
      /BTC wallet returned empty public key/,
    );
    expect(() => normalizeXOnlyPubkey(42)).toThrow(
      /BTC wallet returned empty public key/,
    );
  });

  it("throws on invalid hex characters", () => {
    expect(() => normalizeXOnlyPubkey("zzzz")).toThrow();
  });
});

describe("normalizePopSignature", () => {
  it("accepts 0x-prefixed lowercase hex unchanged", () => {
    expect(normalizePopSignature("0xdeadbeef")).toBe("0xdeadbeef");
  });

  it("lowercases 0x-prefixed uppercase hex", () => {
    expect(normalizePopSignature("0xDEADBEEF")).toBe("0xdeadbeef");
  });

  it("0x-prefixes unprefixed hex when input is pure hex", () => {
    // Hex precedence over base64 prevents silent misinterpretation of
    // wallets that return bare hex like "deadbeef".
    expect(normalizePopSignature("deadbeef")).toBe("0xdeadbeef");
  });

  it("decodes canonical standard base64 to 0x-prefixed hex", () => {
    // "SGVsbG8=" -> "Hello" -> "48656c6c6f"
    expect(normalizePopSignature("SGVsbG8=")).toBe("0x48656c6c6f");
  });

  it("rejects URL-safe base64 (- and _)", () => {
    // URL-safe base64 of bytes that include non-standard chars
    // "AB-_" uses URL-safe alphabet; standard base64 rejects '-' and '_'.
    expect(() => normalizePopSignature("AB-_")).toThrow(
      /malformed base64 BIP-322 signature/,
    );
  });

  it("rejects base64 missing padding", () => {
    // "SGVsbG8" (no padding) — pure hex regex rejects (G is not hex), so
    // it falls through to base64 which requires length % 4 === 0.
    expect(() => normalizePopSignature("SGVsbG8")).toThrow(
      /malformed base64 BIP-322 signature/,
    );
  });

  it("rejects non-canonical base64 (round-trip mismatch)", () => {
    // "AB==" decodes to one byte (0x00) but re-encodes to "AA==", so
    // the round-trip check rejects it.
    expect(() => normalizePopSignature("AB==")).toThrow(
      /malformed base64 BIP-322 signature/,
    );
  });

  it("rejects malformed 0x-prefixed hex with odd length", () => {
    expect(() => normalizePopSignature("0xabc")).toThrow(
      /malformed hex BIP-322 signature/,
    );
  });

  it("rejects malformed unprefixed hex with odd length", () => {
    expect(() => normalizePopSignature("abc")).toThrow(
      /malformed hex BIP-322 signature/,
    );
  });

  it("rejects 0x prefix with no payload", () => {
    expect(() => normalizePopSignature("0x")).toThrow(
      /malformed hex BIP-322 signature/,
    );
  });

  it("throws on empty string", () => {
    expect(() => normalizePopSignature("")).toThrow(
      /BTC wallet returned empty BIP-322 signature/,
    );
  });

  it("throws on non-string input", () => {
    expect(() => normalizePopSignature(undefined)).toThrow(
      /BTC wallet returned empty BIP-322 signature/,
    );
  });
});
