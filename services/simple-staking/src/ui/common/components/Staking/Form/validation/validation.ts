/**
 * Validates if the value does not have any decimal points.
 * @param value The value to validate, as a string or number.
 * @returns `true` if the value does not have any decimal points, otherwise `false`.
 */
export const validateNoDecimalPoints = (value: string | number): boolean => {
  const valueString = String(value);
  return !valueString.includes(".") && !valueString.includes(",");
};

/**
 * Validates if the value has no more than 8 decimal points.
 * @param value The value to validate, as a string or number.
 * @returns `true` if the value has no more than 8 decimal points, otherwise `false`.
 */
export const validateDecimalPoints = (
  value: string | number,
  decimals: number = 8,
): boolean => {
  const decimalPoints = String(value).split(".")[1]?.length || 0;
  return decimalPoints <= decimals;
};
