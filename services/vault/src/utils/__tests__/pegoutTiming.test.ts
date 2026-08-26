/**
 * Tests for peg-out timing helpers.
 */

import { describe, expect, it } from "vitest";

import { maxAssertTimelockBlocks, payoutEtaMinutes } from "../pegoutTiming";

describe("maxAssertTimelockBlocks", () => {
  // resolver: version -> timelockAssert blocks (bigint), undefined if unknown
  const resolve = (v: number): bigint | undefined =>
    ({ 1: 91n, 2: 684n, 3: 200n })[v as 1 | 2 | 3];

  it("returns 0 when there are no versions (no selection, no wait)", () => {
    expect(maxAssertTimelockBlocks([], resolve, 684)).toBe(0);
  });

  it("returns the max resolved timelock across versions", () => {
    expect(maxAssertTimelockBlocks([1, 2, 3], resolve, 0)).toBe(684);
  });

  it("uses the fallback for an undefined version (conservative)", () => {
    // 91 resolved; the undefined vault contributes the fallback (684) -> 684.
    expect(maxAssertTimelockBlocks([1, undefined], resolve, 684)).toBe(684);
  });

  it("uses the fallback for a version the resolver can't resolve", () => {
    expect(maxAssertTimelockBlocks([1, 99], resolve, 684)).toBe(684);
  });

  it("prefers a larger resolved value over the fallback", () => {
    expect(maxAssertTimelockBlocks([2, undefined], resolve, 100)).toBe(684);
  });

  it("falls back when no version resolves", () => {
    expect(maxAssertTimelockBlocks([99, undefined], resolve, 684)).toBe(684);
  });
});

describe("payoutEtaMinutes", () => {
  it("returns the full timelock in minutes at zero confirmations", () => {
    expect(payoutEtaMinutes(684, 0, 10)).toBe(6840);
  });

  it("subtracts confirmations from the timelock", () => {
    expect(payoutEtaMinutes(91, 76, 10)).toBe(150);
  });

  it("returns 0 when confirmations meet the timelock", () => {
    expect(payoutEtaMinutes(684, 684, 10)).toBe(0);
  });

  it("clamps to 0 when confirmations exceed the timelock", () => {
    expect(payoutEtaMinutes(684, 700, 10)).toBe(0);
  });
});
