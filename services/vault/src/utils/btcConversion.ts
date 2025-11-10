/**
 * BTC conversion utilities for handling bigint satoshis
 *
 * All BTC amounts should be stored and passed as bigint (satoshis) throughout the application.
 * Only convert to strings/numbers at the UI boundary for display purposes.
 */

/**
 * Convert satoshis (bigint) to BTC display string
 * Only use this function when displaying to users
 *
 * @param satoshi - Amount in satoshis (bigint)
 * @param decimals - Number of decimal places to display (default: 8)
 * @returns Formatted BTC string for display
 */
export function satoshiToBtcString(
  satoshi: bigint,
  decimals: number = 8,
): string {
  const btcValue = Number(satoshi) / 100000000;
  return btcValue.toFixed(decimals);
}

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
 * Convert BTC string input to satoshis (bigint)
 * Use this when parsing user input from forms
 *
 * @param btc - BTC amount as string (e.g., "0.5", "1.25")
 * @returns Amount in satoshis (bigint)
 */
export function btcStringToSatoshi(btc: string): bigint {
  const btcNum = parseFloat(btc);
  if (isNaN(btcNum) || btcNum < 0) return 0n;
  return BigInt(Math.floor(btcNum * 100000000));
}

/**
 * Convert BTC number to satoshis (bigint)
 * Use with caution - prefer btcStringToSatoshi for user input
 *
 * @param btc - BTC amount as number
 * @returns Amount in satoshis (bigint)
 */
export function btcNumberToSatoshi(btc: number): bigint {
  if (isNaN(btc) || btc < 0) return 0n;
  return BigInt(Math.floor(btc * 100000000));
}

/**
 * Transform satoshi amounts to display format
 * Removes trailing zeros for cleaner display
 *
 * @param satoshis - Amount in satoshis
 * @param decimals - Number of decimal places (default: 8)
 * @returns Formatted BTC string
 */
export function formatSatoshisToBtc(
  satoshis: bigint,
  decimals: number = 8,
): string {
  const SATOSHIS_PER_BTC = 100_000_000n;
  const whole = satoshis / SATOSHIS_PER_BTC;
  const fraction = satoshis % SATOSHIS_PER_BTC;

  // Get fractional part as string, pad with leading zeros to 8 digits
  let fractionStr = fraction.toString().padStart(8, "0").slice(0, decimals);
  // Remove trailing zeros from fractional part
  fractionStr = fractionStr.replace(/0+$/, "");

  return fractionStr.length > 0
    ? `${whole.toString()}.${fractionStr}`
    : whole.toString();
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
