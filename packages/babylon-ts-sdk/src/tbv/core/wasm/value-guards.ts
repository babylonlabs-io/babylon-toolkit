/** Largest value representable by the WASM boundary's u64 amount fields. */
const U64_MAX = (1n << 64n) - 1n;

/** Validate satoshi arrays before constructing a `BigUint64Array`. */
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
