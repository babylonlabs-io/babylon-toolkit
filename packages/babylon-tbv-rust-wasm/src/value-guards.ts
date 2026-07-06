/**
 * Runtime guards for value-bearing scalars crossing the WASM FFI boundary,
 * in both directions.
 *
 * wasm-bindgen returns `u64` outputs as JS `bigint`, but nothing in the type
 * system enforces the shape or sign at runtime: an ABI regression or a
 * doctored binary could hand back a non-bigint or a non-positive value that
 * would then flow into satoshi math unchecked. Every sat-valued WASM return
 * is funneled through {@link assertWasmBigint} so an invalid value fails loudly
 * at the seam instead of silently corrupting a transaction.
 *
 * The same risk exists on the way *in*: `new BigUint64Array(values)` is the
 * only way satoshi amounts are handed to the constructor, and a runtime cast
 * (`as readonly bigint[]`) lets a caller pass a non-bigint or non-positive
 * element that `BigUint64Array` would either reject cryptically or, in its
 * length-arg form, silently zero-fill. {@link assertPositiveBigintArray}
 * validates such inputs before the typed-array construction.
 */

/** Largest value BigUint64Array stores without wrapping mod 2^64 (2^64 − 1). */
const U64_MAX = (1n << 64n) - 1n;

/**
 * Assert a WASM-returned value is a positive `bigint` and return it narrowed.
 *
 * @param value - The raw value returned across the WASM boundary.
 * @param label - Human-readable name used in the thrown error.
 * @throws If `value` is not a `bigint`, or is not strictly greater than 0.
 */
export function assertWasmBigint(value: unknown, label: string): bigint {
  if (typeof value !== "bigint") {
    throw new Error(
      `WASM returned a non-bigint ${label} (got ${typeof value}); ` +
        `refusing to use it in satoshi math.`,
    );
  }
  if (value <= 0n) {
    throw new Error(
      `WASM returned a non-positive ${label} (${value}); expected > 0.`,
    );
  }
  return value;
}

/**
 * Assert a value is a non-empty array of strictly-positive `bigint`s and return
 * it narrowed, ready to feed into `new BigUint64Array(...)`.
 *
 * Input counterpart to {@link assertWasmBigint}: TypeScript types the satoshi
 * amounts as `readonly bigint[]`, but a runtime cast bypasses that, so validate
 * the actual values before they cross into the WASM constructor.
 *
 * @param values - The candidate array of satoshi amounts.
 * @param label - Human-readable name used in the thrown error.
 * @throws If `values` is not an array, is empty, or contains any element that is
 *   not a `bigint`, is not strictly greater than 0, or exceeds the u64 maximum
 *   (which `BigUint64Array` would otherwise wrap mod 2^64).
 */
export function assertPositiveBigintArray(
  values: unknown,
  label: string,
): bigint[] {
  if (!Array.isArray(values)) {
    throw new Error(
      `${label} must be an array of positive bigints (got ${typeof values}).`,
    );
  }
  if (values.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  values.forEach((value, i) => {
    if (typeof value !== "bigint") {
      throw new Error(
        `${label}[${i}] must be a bigint (got ${typeof value}); ` +
          `refusing to feed it into satoshi math.`,
      );
    }
    if (value <= 0n) {
      throw new Error(`${label}[${i}] must be > 0 (got ${value}).`);
    }
    if (value > U64_MAX) {
      throw new Error(
        `${label}[${i}] must fit in a u64 (got ${value}); ` +
          `refusing to feed it into satoshi math.`,
      );
    }
  });
  return values as bigint[];
}
