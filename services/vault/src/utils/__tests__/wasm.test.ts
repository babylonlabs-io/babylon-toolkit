import { describe, expect, it } from "vitest";

import {
  assertMinClaimValue,
  assertMinPeginFee,
  assertNumLocalChallengers,
} from "../wasm";

describe("assertNumLocalChallengers", () => {
  it("returns the value when within bounds", () => {
    expect(assertNumLocalChallengers(1)).toBe(1);
    expect(assertNumLocalChallengers(100)).toBe(100);
  });

  it("throws when the count is below the minimum of 1", () => {
    expect(() => assertNumLocalChallengers(0)).toThrow(/below the minimum/);
  });

  it("throws when the count exceeds the sanity bound", () => {
    expect(() => assertNumLocalChallengers(101)).toThrow(/sanity bound/);
  });
});

describe("assertMinClaimValue", () => {
  it("returns the value when positive and within bounds", () => {
    expect(assertMinClaimValue(1n)).toBe(1n);
    expect(assertMinClaimValue(1_000_000_000n)).toBe(1_000_000_000n);
  });

  it("throws on a zero return", () => {
    expect(() => assertMinClaimValue(0n)).toThrow(/non-positive/);
  });

  it("throws on a negative return", () => {
    expect(() => assertMinClaimValue(-1n)).toThrow(/non-positive/);
  });

  it("throws when above the sanity bound", () => {
    expect(() => assertMinClaimValue(1_000_000_001n)).toThrow(/sanity bound/);
  });
});

describe("assertMinPeginFee", () => {
  it("returns the value when positive and within bounds", () => {
    expect(assertMinPeginFee(1n)).toBe(1n);
    expect(assertMinPeginFee(100_000_000n)).toBe(100_000_000n);
  });

  it("throws on a zero return", () => {
    expect(() => assertMinPeginFee(0n)).toThrow(/non-positive/);
  });

  it("throws on a negative return", () => {
    expect(() => assertMinPeginFee(-1n)).toThrow(/non-positive/);
  });

  it("throws when above the sanity bound", () => {
    expect(() => assertMinPeginFee(100_000_001n)).toThrow(/sanity bound/);
  });
});
