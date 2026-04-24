import { describe, expect, it } from "vitest";

import {
  PEGIN_AUTH_ANCHOR_OUTPUTS,
  PEGIN_FIXED_OUTPUTS,
  peginOutputCount,
} from "../constants";

describe("peginOutputCount", () => {
  it("defaults to omitting the auth-anchor output (backward-compatible)", () => {
    expect(peginOutputCount(1)).toBe(1 + PEGIN_FIXED_OUTPUTS);
  });

  it("includes the auth-anchor output when hasAuthAnchor = true", () => {
    expect(peginOutputCount(1, true)).toBe(
      1 + PEGIN_FIXED_OUTPUTS + PEGIN_AUTH_ANCHOR_OUTPUTS,
    );
  });

  it("omits the auth-anchor output when hasAuthAnchor = false", () => {
    expect(peginOutputCount(1, false)).toBe(1 + PEGIN_FIXED_OUTPUTS);
  });

  it("scales with vault count", () => {
    expect(peginOutputCount(3, true)).toBe(
      3 + PEGIN_FIXED_OUTPUTS + PEGIN_AUTH_ANCHOR_OUTPUTS,
    );
    expect(peginOutputCount(3, false)).toBe(3 + PEGIN_FIXED_OUTPUTS);
  });

  it("single-vault with auth anchor = 3 outputs (HTLC + OP_RETURN + CPFP anchor)", () => {
    expect(peginOutputCount(1, true)).toBe(3);
  });

  it("3-vault batch with auth anchor = 5 outputs (3 HTLCs + OP_RETURN + CPFP anchor)", () => {
    expect(peginOutputCount(3, true)).toBe(5);
  });
});
