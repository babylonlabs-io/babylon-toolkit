export interface FormatCurrencyOptions<T extends string = string> {
  prefix?: T;
  precision?: number;
  zeroDisplay?: string;
  format?: Intl.NumberFormatOptions;
}

const defaultFormatOptions: Required<FormatCurrencyOptions> = {
  prefix: "$",
  precision: 2,
  zeroDisplay: "-",
  format: {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  },
};

/**
 * Calculates the minimum displayable unit based on formatting options
 * @param format The number format options
 * @param precision The default precision to use if format doesn't specify
 * @returns The minimum unit value (e.g., 0.01 for 2 decimal places)
 */
export function getMinimumDisplayUnit(
  format: Intl.NumberFormatOptions | undefined,
  precision: number,
): number {
  const decimalPlaces = format?.minimumFractionDigits ?? precision;
  return Math.pow(10, -decimalPlaces);
}

export function formatCurrency(
  currencyValue: number,
  options: FormatCurrencyOptions = {},
): string {
  const { prefix, precision, zeroDisplay, format } = {
    ...defaultFormatOptions,
    ...options,
  };

  if (currencyValue === 0) return zeroDisplay;

  // Show a meaningful value for very small non-zero amounts instead of "$0.00"
  const minUnit = getMinimumDisplayUnit(format, precision);

  if (currencyValue > 0 && currencyValue < minUnit) {
    return `< ${prefix}${minUnit.toFixed(format?.minimumFractionDigits ?? precision)}`;
  }

  const formatted = currencyValue.toLocaleString(
    "en",
    format ?? { maximumFractionDigits: precision },
  );

  return `${prefix}${formatted}`;
}

/**
 * Converts token amount to formatted currency string
 * @param amount The amount of token
 * @param price The price of token in currency
 * @param options Formatting options
 */
export function calculateTokenValueInCurrency(
  amount: number,
  price: number,
  options?: FormatCurrencyOptions,
): string {
  const currencyValue = amount * price;
  return formatCurrency(currencyValue, options);
}
