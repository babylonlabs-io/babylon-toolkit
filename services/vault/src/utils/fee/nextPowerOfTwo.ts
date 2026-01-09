export const nextPowerOfTwo = (x: number) => {
  if (x <= 0) {
    throw new RangeError("nextPowerOfTwo: x must be a positive number");
  }
  if (x === 1) return 2;

  return Math.pow(2, Math.ceil(Math.log2(x)) + 1);
};
