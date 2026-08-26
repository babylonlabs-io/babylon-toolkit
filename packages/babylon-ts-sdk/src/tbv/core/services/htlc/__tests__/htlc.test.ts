import { describe, expect, it } from "vitest";

import { computeHashlock, validateSecretAgainstHashlock } from "../index";

// Known test vector: SHA-256 of 32 zero bytes
// sha256(0x0000...0000) = 0x66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925
const ZERO_SECRET =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const ZERO_HASHLOCK =
  "0x66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925" as const;

// Second test vector: SHA-256 of 32 0xFF bytes
// sha256(0xffff...ffff) = 0xaf9613760f72635fbdb44a5a0a63c39f12af30f950a6ee5c971be188e89c4051
const FF_SECRET =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as const;
const FF_HASHLOCK =
  "0xaf9613760f72635fbdb44a5a0a63c39f12af30f950a6ee5c971be188e89c4051" as const;

describe("computeHashlock", () => {
  it("produces correct SHA-256 for zero bytes", () => {
    expect(computeHashlock(ZERO_SECRET)).toBe(ZERO_HASHLOCK);
  });

  it("produces correct SHA-256 for 0xFF bytes", () => {
    expect(computeHashlock(FF_SECRET)).toBe(FF_HASHLOCK);
  });

  it("returns 0x-prefixed 66-char hex", () => {
    const result = computeHashlock(ZERO_SECRET);
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.length).toBe(66);
  });

  it("throws if secret is not exactly 32 bytes", () => {
    // Too short (31 bytes)
    expect(() =>
      computeHashlock(
        "0x00000000000000000000000000000000000000000000000000000000000000",
      ),
    ).toThrow("must be exactly 32 bytes");

    // Too long (33 bytes)
    expect(() =>
      computeHashlock(
        "0x000000000000000000000000000000000000000000000000000000000000000000",
      ),
    ).toThrow("must be exactly 32 bytes");
  });

  it("throws length error when secret is missing 0x prefix", () => {
    // Without 0x prefix, the string is 64 chars instead of 66, so the
    // bytes32 length check fires first
    expect(() =>
      computeHashlock(
        "0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
      ),
    ).toThrow("must be exactly 32 bytes");
  });

  it("throws on non-hex characters", () => {
    expect(() =>
      computeHashlock(
        "0xgggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg",
      ),
    ).toThrow("non-hex characters");
  });
});

describe("validateSecretAgainstHashlock", () => {
  it("returns true for matching secret and hashlock", () => {
    expect(validateSecretAgainstHashlock(ZERO_SECRET, ZERO_HASHLOCK)).toBe(
      true,
    );
    expect(validateSecretAgainstHashlock(FF_SECRET, FF_HASHLOCK)).toBe(true);
  });

  it("returns false for mismatched secret and hashlock", () => {
    expect(validateSecretAgainstHashlock(ZERO_SECRET, FF_HASHLOCK)).toBe(false);
    expect(validateSecretAgainstHashlock(FF_SECRET, ZERO_HASHLOCK)).toBe(false);
  });

  it("is case-insensitive for hashlock comparison", () => {
    const uppercaseHashlock =
      ZERO_HASHLOCK.toUpperCase() as `0x${string}`;
    expect(validateSecretAgainstHashlock(ZERO_SECRET, uppercaseHashlock)).toBe(
      true,
    );
  });

  it("throws if hashlock is not exactly 32 bytes", () => {
    expect(() =>
      validateSecretAgainstHashlock(ZERO_SECRET, "0xabcd"),
    ).toThrow("must be exactly 32 bytes");
  });

  it("throws if secret is not exactly 32 bytes", () => {
    expect(() =>
      validateSecretAgainstHashlock("0xabcd", ZERO_HASHLOCK),
    ).toThrow("must be exactly 32 bytes");
  });

  it("throws if hashlock contains non-hex characters", () => {
    const invalidHashlock =
      "0xzz687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925" as `0x${string}`;
    expect(() =>
      validateSecretAgainstHashlock(ZERO_SECRET, invalidHashlock),
    ).toThrow("non-hex characters");
  });
});
