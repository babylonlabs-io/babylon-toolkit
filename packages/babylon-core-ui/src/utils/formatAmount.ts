/**
 * Splits a formatted amount string into value and unit parts
 * @param formattedAmount - Amount string like "$525.40M"
 * @returns Object with value and unit separated
 * @example
 * splitAmountUnit("$525.40M") // { value: "$525.40", unit: "M" }
 * splitAmountUnit("$70.84K") // { value: "$70.84", unit: "K" }
 * splitAmountUnit("$100") // { value: "$100", unit: "" }
 */
export function splitAmountUnit(formattedAmount: string): { value: string; unit: string } {
  const match = formattedAmount.match(/^(.*?)([MKB])$/);
  if (match) {
    return { value: match[1], unit: match[2] };
  }
  return { value: formattedAmount, unit: '' };
}

