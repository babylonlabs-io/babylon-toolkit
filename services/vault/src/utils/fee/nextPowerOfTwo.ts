/**
 * Calculates the next power of two greater than the input value.
 *
 * Used in fee calculations to determine a safe upper bound for the max fee rate
 * that provides headroom above the current network fee rate.
 *
 * @param x - A positive number to find the next power of two for
 * @returns The smallest power of two greater than x
 * @throws {RangeError} If x is zero or negative
 *
 * @example
 * nextPowerOfTwo(1)   // returns 2
 * nextPowerOfTwo(2)   // returns 4
 * nextPowerOfTwo(50)  // returns 128
 * nextPowerOfTwo(100) // returns 256
 */
export const nextPowerOfTwo = (x: number): number => {
  if (x <= 0) {
    throw new RangeError("nextPowerOfTwo: x must be a positive number");
  }
  if (x === 1) return 2;

  return Math.pow(2, Math.ceil(Math.log2(x)) + 1);
};
