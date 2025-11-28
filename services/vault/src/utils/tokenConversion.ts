/**
 * Token conversion utilities for handling ERC20 tokens with decimals
 */

/**
 * USDC decimals constant (USDC uses 6 decimals)
 */
export const USDC_DECIMALS = 6;

/**
 * Format token amount from smallest unit to human-readable string
 * @param amount - Amount in smallest unit (wei equivalent)
 * @param decimals - Number of decimals for the token (default: 18 for standard ERC20)
 * @param displayDecimals - Number of decimal places to show (default: 2)
 * @returns Formatted amount as string
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number = 18,
  displayDecimals: number = 2,
): string {
  const divisor = 10 ** decimals;
  const tokenAmount = Number(amount) / divisor;

  // Format with specified decimal places, removing trailing zeros
  return tokenAmount.toFixed(displayDecimals).replace(/\.?0+$/, "") || "0";
}

/**
 * Format USDC amount from wei (6 decimals) to human-readable string
 * @param amount - Amount in smallest unit (6 decimals for USDC)
 * @returns Formatted amount as string (e.g., "1000.50")
 */
export function formatUSDCAmount(amount: bigint): string {
  return formatTokenAmount(amount, USDC_DECIMALS, 2);
}
