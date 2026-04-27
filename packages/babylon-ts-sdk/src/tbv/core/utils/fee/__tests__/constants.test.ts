import { describe, expect, it } from "vitest";

import {
  PEGIN_AUTH_ANCHOR_OUTPUTS,
  PEGIN_FIXED_OUTPUTS,
  peginOutputCount,
} from "../constants";

const VALID_AUTH_ANCHOR_HASH = "a".repeat(64);

describe("peginOutputCount", () => {
  it("omits the auth-anchor output when authAnchorHash is undefined", () => {
    expect(peginOutputCount(1)).toBe(1 + PEGIN_FIXED_OUTPUTS);
  });

  it("omits the auth-anchor output when authAnchorHash is null", () => {
    expect(peginOutputCount(1, null)).toBe(1 + PEGIN_FIXED_OUTPUTS);
  });

  it("omits the auth-anchor output when authAnchorHash is empty string", () => {
    expect(peginOutputCount(1, "")).toBe(1 + PEGIN_FIXED_OUTPUTS);
  });

  it("includes the auth-anchor output when authAnchorHash is a hex string", () => {
    expect(peginOutputCount(1, VALID_AUTH_ANCHOR_HASH)).toBe(
      1 + PEGIN_FIXED_OUTPUTS + PEGIN_AUTH_ANCHOR_OUTPUTS,
    );
  });

  it("scales with vault count", () => {
    expect(peginOutputCount(3, VALID_AUTH_ANCHOR_HASH)).toBe(
      3 + PEGIN_FIXED_OUTPUTS + PEGIN_AUTH_ANCHOR_OUTPUTS,
    );
    expect(peginOutputCount(3)).toBe(3 + PEGIN_FIXED_OUTPUTS);
  });

  it("single-vault with auth anchor = 3 outputs (HTLC + OP_RETURN + CPFP anchor)", () => {
    expect(peginOutputCount(1, VALID_AUTH_ANCHOR_HASH)).toBe(3);
  });

  it("3-vault batch with auth anchor = 5 outputs (3 HTLCs + OP_RETURN + CPFP anchor)", () => {
    expect(peginOutputCount(3, VALID_AUTH_ANCHOR_HASH)).toBe(5);
  });

  it("rejects vaultCount = 0 (no HTLC means no Pre-PegIn at all)", () => {
    expect(() => peginOutputCount(0)).toThrow(/positive integer/);
    expect(() => peginOutputCount(0, VALID_AUTH_ANCHOR_HASH)).toThrow(
      /positive integer/,
    );
  });

  it("rejects negative vault count", () => {
    expect(() => peginOutputCount(-1)).toThrow(/positive integer/);
  });

  it("rejects non-integer vault count", () => {
    expect(() => peginOutputCount(1.5)).toThrow(/positive integer/);
    expect(() => peginOutputCount(Number.NaN)).toThrow(/positive integer/);
  });
});
