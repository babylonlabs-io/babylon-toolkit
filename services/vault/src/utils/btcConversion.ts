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
