import { assertPositiveBigintArray as wasmAssertPositiveBigintArray } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { describe, expect, it } from "vitest";

import { assertPositiveBigintArray } from "../value-guards";

const U64_MAX = (1n << 64n) - 1n;

function outcome(guard: (values: unknown, label: string) => bigint[]) {
  return (values: unknown): bigint[] | string => {
    try {
      return guard(values, "peginAmounts");
    } catch (error) {
      return (error as Error).message;
    }
  };
}

describe("assertPositiveBigintArray", () => {
  it("behaves identically to the WASM package's copy", () => {
    const vectors: unknown[] = [
      [1n],
      [1n, 2n, 100_000n],
      [U64_MAX],
      [0n],
      [-1n],
      [1n, 0n],
      [U64_MAX + 1n],
      [1n, U64_MAX + 1n],
      [1],
      ["1"],
      [undefined],
      [],
      undefined,
      "not an array",
      { 0: 1n, length: 1 },
    ];
    const local = outcome(assertPositiveBigintArray);
    const wasm = outcome(wasmAssertPositiveBigintArray);

    for (const vector of vectors) {
      expect(local(vector)).toEqual(wasm(vector));
    }
  });

  it("returns the narrowed array for valid satoshi amounts", () => {
    expect(assertPositiveBigintArray([1n, U64_MAX], "peginAmounts")).toEqual([
      1n,
      U64_MAX,
    ]);
  });

  it("rejects an amount that BigUint64Array would wrap mod 2^64", () => {
    expect(() =>
      assertPositiveBigintArray([U64_MAX + 1n], "peginAmounts"),
    ).toThrow(/must fit in a u64/);
  });
});
