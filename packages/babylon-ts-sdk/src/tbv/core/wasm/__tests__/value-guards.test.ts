import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { assertPositiveBigintArray } from "../value-guards";

// Differential source of truth: the engine's own guard, loaded from its
// TypeScript source rather than its package specifier. The specifier resolves
// to the engine's built `dist/`, so a stale build would pin this copy to bytes
// the engine no longer ships.
const ENGINE_VALUE_GUARDS_SOURCE = resolve(
  __dirname,
  "../../../../../../babylon-tbv-rust-wasm/src/value-guards.ts",
);

const { assertPositiveBigintArray: engineAssertPositiveBigintArray } =
  (await import(/* @vite-ignore */ ENGINE_VALUE_GUARDS_SOURCE)) as {
    assertPositiveBigintArray: (values: unknown, label: string) => bigint[];
  };

const U64_MAX = 18446744073709551615n;
const ABOVE_U64_MAX = 18446744073709551616n;
const RANDOM_VECTOR_SEED = 0x5eedc0de;
const RANDOM_VECTOR_COUNT = 256;
const MAX_RANDOM_ARRAY_LENGTH = 4;
const U32_MODULUS = 0x100000000;
const RANDOM_VECTOR_SHAPES = 10;

function outcome(guard: (values: unknown, label: string) => bigint[]) {
  return (values: unknown): bigint[] | string => {
    try {
      return guard(values, "peginAmounts");
    } catch (error) {
      return (error as Error).message;
    }
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / U32_MODULUS;
  };
}

function randomU64(next: () => number): bigint {
  const high = BigInt(Math.floor(next() * U32_MODULUS));
  const low = BigInt(Math.floor(next() * U32_MODULUS));
  return (high << 32n) | low;
}

function randomElement(next: () => number): unknown {
  const pool: unknown[] = [
    randomU64(next),
    (randomU64(next) % 100_000n) + 1n,
    0n,
    -randomU64(next) - 1n,
    1n,
    U64_MAX,
    ABOVE_U64_MAX,
    ABOVE_U64_MAX + randomU64(next),
    Number(randomU64(next) % 100_000n),
    String(randomU64(next)),
    undefined,
    null,
  ];
  return pool[Math.floor(next() * pool.length)];
}

function randomVector(next: () => number): unknown {
  const shape = Math.floor(next() * RANDOM_VECTOR_SHAPES);
  if (shape === 0) return undefined;
  if (shape === 1) return "not an array";
  if (shape === 2) return { 0: 1n, length: 1 };
  if (shape === 3) return [];
  const length = 1 + Math.floor(next() * MAX_RANDOM_ARRAY_LENGTH);
  return Array.from({ length }, () => randomElement(next));
}

describe("assertPositiveBigintArray", () => {
  it("returns the narrowed array for valid satoshi amounts", () => {
    expect(assertPositiveBigintArray([1n, U64_MAX], "peginAmounts")).toEqual([
      1n,
      U64_MAX,
    ]);
  });

  it("rejects a non-array with the label and the received type", () => {
    expect(() => assertPositiveBigintArray("nope", "peginAmounts")).toThrow(
      "peginAmounts must be an array of positive bigints (got string).",
    );
  });

  it("rejects an empty array", () => {
    expect(() => assertPositiveBigintArray([], "peginAmounts")).toThrow(
      "peginAmounts must not be empty.",
    );
  });

  it("rejects a non-bigint element at its index", () => {
    expect(() => assertPositiveBigintArray([1n, 2], "peginAmounts")).toThrow(
      "peginAmounts[1] must be a bigint (got number); " +
        "refusing to feed it into satoshi math.",
    );
  });

  it("rejects a non-positive element at its index", () => {
    expect(() => assertPositiveBigintArray([0n], "peginAmounts")).toThrow(
      "peginAmounts[0] must be > 0 (got 0).",
    );
  });

  it("rejects an amount that BigUint64Array would wrap mod 2^64", () => {
    expect(() =>
      assertPositiveBigintArray([1n, ABOVE_U64_MAX], "peginAmounts"),
    ).toThrow(
      "peginAmounts[1] must fit in a u64 (got 18446744073709551616); " +
        "refusing to feed it into satoshi math.",
    );
  });

  it("behaves identically to the engine source's copy on boundary vectors", () => {
    const vectors: unknown[] = [
      [1n],
      [1n, 2n, 100_000n],
      [U64_MAX],
      [0n],
      [-1n],
      [1n, 0n],
      [ABOVE_U64_MAX],
      [1n, ABOVE_U64_MAX],
      [1],
      ["1"],
      [undefined],
      [],
      undefined,
      "not an array",
      { 0: 1n, length: 1 },
    ];
    const local = outcome(assertPositiveBigintArray);
    const wasm = outcome(engineAssertPositiveBigintArray);

    for (const vector of vectors) {
      expect(local(vector)).toEqual(wasm(vector));
    }
  });

  it("behaves identically to the engine source's copy on seeded random vectors", () => {
    const next = mulberry32(RANDOM_VECTOR_SEED);
    const local = outcome(assertPositiveBigintArray);
    const wasm = outcome(engineAssertPositiveBigintArray);

    for (let index = 0; index < RANDOM_VECTOR_COUNT; index += 1) {
      const vector = randomVector(next);
      expect(
        local(vector),
        `seed ${RANDOM_VECTOR_SEED}, vector ${index}: ${String(vector)}`,
      ).toEqual(wasm(vector));
    }
  });
});
