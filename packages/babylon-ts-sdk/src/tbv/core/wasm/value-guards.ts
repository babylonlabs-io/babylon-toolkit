/**
 * Runtime guard for satoshi amounts crossing into the WASM FFI boundary.
 *
 * `new BigUint64Array(values)` is the only way satoshi amounts are handed to
 * the constructor, and a runtime cast (`as readonly bigint[]`) lets a caller
 * pass a non-bigint or non-positive element that `BigUint64Array` would either
 * reject cryptically or, in its length-arg form, silently zero-fill. Values
 * above the u64 maximum are worse still: `BigUint64Array` wraps them mod 2^64
 * without complaint, turning an oversized amount into a small one.
 * {@link assertPositiveBigintArray} validates such inputs before the
 * typed-array construction.
 *
 * Mirrors the `assertPositiveBigintArray` half of `value-guards.ts` in
 * `@babylonlabs-io/babylon-tbv-rust-wasm`; that one function is pinned to the
 * engine's source copy by `__tests__/value-guards.test.ts`. The engine's other
 * guard, `assertWasmBigint`, has no counterpart here: the engine applies it to
 * its own WASM return values before they reach this package.
 */

/** Largest value BigUint64Array stores without wrapping mod 2^64 (2^64 − 1). */
const U64_MAX = (1n << 64n) - 1n;

/**
 * Assert a value is a non-empty array of strictly-positive `bigint`s and return
 * it narrowed, ready to feed into `new BigUint64Array(...)`.
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
  values.forEach((value, index) => {
    if (typeof value !== "bigint") {
      throw new Error(
        `${label}[${index}] must be a bigint (got ${typeof value}); ` +
          `refusing to feed it into satoshi math.`,
      );
    }
    if (value <= 0n) {
      throw new Error(`${label}[${index}] must be > 0 (got ${value}).`);
    }
    if (value > U64_MAX) {
      throw new Error(
        `${label}[${index}] must fit in a u64 (got ${value}); ` +
          `refusing to feed it into satoshi math.`,
      );
    }
  });
  return values as bigint[];
}
