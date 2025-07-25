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

export function formatCurrency(currencyValue: number, options: FormatCurrencyOptions = {}): string {
  const { prefix, precision, zeroDisplay, format } = {
    ...defaultFormatOptions,
    ...options,
  };

  if (currencyValue === 0) return zeroDisplay;

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