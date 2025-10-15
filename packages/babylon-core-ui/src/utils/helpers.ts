import { Decimal } from "decimal.js-light";

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
function getMinimumDisplayUnit(
  format: Intl.NumberFormatOptions | undefined,
  precision: number,
): number {
  const decimalPlaces = format?.minimumFractionDigits ?? precision;
  return Math.pow(10, -decimalPlaces);
}

export function formatCurrency(currencyValue: number, options: FormatCurrencyOptions = {}): string {
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

  const formatted = currencyValue.toLocaleString("en", format ?? { maximumFractionDigits: precision });

  return `${prefix}${formatted}`;
}

/**
 * Converts token amount to formatted currency string
 * @param amount The amount of token
 * @param price The price of token in currency
 * @param options Formatting options
 */
export function calculateTokenValueInCurrency(amount: number, price: number, options?: FormatCurrencyOptions): string {
  const currencyValue = amount * price;
  return formatCurrency(currencyValue, options);
}

/**
 * Limits the number of decimal places of a given number to a specified maximum.
 *
 * @param value The original number that you want to limit the decimal places for.
 * @param maxDecimals The maximum number of decimal places that the result should have.
 * @returns The number rounded to the specified number of decimal places.
 *
 * @example
 * maxDecimals(3.14159, 2);         // returns 3.14
 * maxDecimals(1.005, 2);           // returns 1.01
 * maxDecimals(10, 0);              // returns 10
 * maxDecimals(0.00010000, 8);      // returns 0.0001
 * maxDecimals(0.00010000, 8);      // returns 0.0001
 * maxDecimals(3.141, 3);           // returns 3.141
 * maxDecimals(3.149, 3);           // returns 3.149
 */
export const maxDecimals = (value: number, maxDecimals: number, rm?: number): number => {
  return new Decimal(value).toDecimalPlaces(maxDecimals, rm).toNumber();
};


/**
 * Converts a string to kebab-case for use as unique or semantic keys.
 *
 * @param str The input string to convert.
 * @returns The kebab-case version of the input string.
 */
export const toKebabCase = (str: string): string => {
  let result = "";

  for (let i = 0; i < str.length; i++) {
    const char = str[i].toLowerCase();

    if ((char >= "a" && char <= "z") || (char >= "0" && char <= "9")) {
      result += char;
    } else if (result.length > 0 && result[result.length - 1] !== "-") {
      result += "-";
    }
  }

  if (result.endsWith("-")) {
    result = result.slice(0, -1);
  }

  return result;
};

/**
 * Creates a generic balance formatter function for cryptocurrency amounts
 * @param coinSymbol The symbol of the cryptocurrency (e.g., 'BTC', 'ETH', 'BABY')
 * @param decimals Number of decimal places to display
 * @returns A formatter function that takes an amount and returns formatted string
 */
export function createBalanceFormatter(coinSymbol: string, decimals: number = 8) {
  return (amount: number): string => {
    return `${amount.toLocaleString(undefined, {
      minimumFractionDigits: Math.min(2, decimals),
      maximumFractionDigits: decimals,
    })} ${coinSymbol}`;
  };
}

/**
 * Formats a number with comma separators
 * @param value The number to format
 * @param decimals Maximum number of decimal places to display (default: 8)
 * @returns Formatted string with commas
 * @example
 * formatAmount(1234.5678, 2) // "1,234.57"
 * formatAmount(1000000, 8) // "1,000,000"
 */
export function formatAmount(value: number, decimals: number = 8): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * Parses a formatted number string (with commas) to a number
 * @param value The formatted string to parse
 * @returns The parsed number, or 0 if invalid
 * @example
 * parseAmount("1,234.56") // 1234.56
 * parseAmount("1,000,000") // 1000000
 * parseAmount("") // 0
 */
export function parseAmount(value: string): number {
  return parseFloat(value.replace(/,/g, '')) || 0;
}
