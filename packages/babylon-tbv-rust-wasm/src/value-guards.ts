/**
 * Runtime guards for value-bearing scalars crossing the WASM FFI boundary.
 *
 * wasm-bindgen returns `u64` outputs as JS `bigint`, but nothing in the type
 * system enforces the shape or sign at runtime: an ABI regression or a
 * doctored binary could hand back a non-bigint or a non-positive value that
 * would then flow into satoshi math unchecked. Every sat-valued WASM return
 * is funneled through {@link assertWasmBigint} so an invalid value fails loudly
 * at the seam instead of silently corrupting a transaction.
 */

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
