/**
 * BTC conversion utilities for handling bigint satoshis
 *
 * All BTC amounts should be stored and passed as bigint (satoshis) throughout the application.
 * Only convert to strings/numbers at the UI boundary for display purposes.
 */

import { formatSatoshisToBtc } from "@babylonlabs-io/ts-sdk/tbv/core";

/**
 * Convert satoshis (bigint) to BTC number for calculations
 * Use with caution - prefer working with bigint satoshis when possible
 *
 * @param satoshi - Amount in satoshis (bigint)
 * @returns BTC amount as number
 */
export function satoshiToBtcNumber(satoshi: bigint): number {
  return Number(satoshi) / 100000000;
}

/**
 * Format satoshis as a comma-grouped BTC display string with optional
 * fractional truncation.
 *
 * Uses SDK's lossless `formatSatoshisToBtc` for the base conversion, then
 * truncates the fractional part to `decimals` digits and adds thousands
 * separators on the integer part — e.g. 100_000_000_000n → "1,000".
 *
 * @param satoshis - Amount in satoshis
 * @param decimals - Number of fractional digits to keep (default: 8 = lossless)
 * @returns Formatted BTC display string
 */
export function formatSatoshisToBtcDisplay(
  satoshis: bigint,
  decimals: number = 8,
): string {
  const raw = formatSatoshisToBtc(satoshis);
  const [whole, fraction = ""] = raw.split(".");
  const truncatedFraction = fraction.slice(0, decimals).replace(/0+$/, "");
  const wholeWithCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return truncatedFraction.length > 0
    ? `${wholeWithCommas}.${truncatedFraction}`
    : wholeWithCommas;
}

/**
 * Parse BTC string to satoshis
 * Uses string manipulation to avoid floating-point precision issues
 *
 * @param btcAmount - BTC amount as string
 * @returns Amount in satoshis
 */
export function parseBtcToSatoshis(btcAmount: string): bigint {
  // Remove any non-numeric characters except decimal
  const cleanAmount = btcAmount.replace(/[^0-9.]/g, "");

  // Validate input: must not be empty, must contain at most one decimal point
  if (
    !cleanAmount ||
    cleanAmount === "." ||
    (cleanAmount.match(/\./g) || []).length > 1
  ) {
    return 0n;
  }

  // Handle decimal places
  const [whole, decimal = ""] = cleanAmount.split(".");
  // If whole is empty (e.g., ".5"), treat as "0"
  const safeWhole = whole === "" ? "0" : whole;
  const paddedDecimal = decimal.padEnd(8, "0").slice(0, 8);
  const satoshis = safeWhole + paddedDecimal;

  // Validate satoshis is a valid integer string
  if (!/^\d+$/.test(satoshis)) {
    return 0n;
  }

  return BigInt(satoshis);
}
