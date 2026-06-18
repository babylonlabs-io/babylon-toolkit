/**
 * Tests for assertPositiveBigintArray — the input guard that validates satoshi
 * amounts before they are handed to `new BigUint64Array(...)` at the WASM
 * boundary (CLAUDE.md #1). TypeScript types these as `readonly bigint[]`, but a
 * runtime cast bypasses that, so the values are checked at runtime.
 */

import { assertPositiveBigintArray } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { describe, expect, it } from "vitest";

describe("assertPositiveBigintArray", () => {
  it("returns the array narrowed when every element is a positive bigint", () => {
    const input = [1n, 100_000n, 42n];
    expect(assertPositiveBigintArray(input, "pegInAmounts")).toBe(input);
  });

  it("throws when the value is not an array", () => {
    expect(() =>
      assertPositiveBigintArray(123n as unknown, "pegInAmounts"),
    ).toThrow(/pegInAmounts must be an array of positive bigints/);
  });

  it("throws when the array is empty", () => {
    expect(() => assertPositiveBigintArray([], "pegInAmounts")).toThrow(
      /pegInAmounts must not be empty/,
    );
  });

  it("throws when an element is not a bigint", () => {
    expect(() =>
      assertPositiveBigintArray(
        [1n, 2 as unknown as bigint] as unknown,
        "pegInAmounts",
      ),
    ).toThrow(/pegInAmounts\[1\] must be a bigint \(got number\)/);
  });

  it("throws when an element is zero", () => {
    expect(() => assertPositiveBigintArray([0n], "pegInAmounts")).toThrow(
      /pegInAmounts\[0\] must be > 0 \(got 0\)/,
    );
  });

  it("throws when an element is negative", () => {
    expect(() => assertPositiveBigintArray([1n, -5n], "pegInAmounts")).toThrow(
      /pegInAmounts\[1\] must be > 0 \(got -5\)/,
    );
  });
});
