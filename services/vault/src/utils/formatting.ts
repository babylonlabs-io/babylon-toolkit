/**
 * Formatting utilities for displaying values in the UI
 */

/**
 * Format LLTV (Loan-to-Liquidation-Threshold Value) from wei to percentage
 * @param lltv - The LLTV value in wei, can be string or bigint
 * @returns Formatted percentage string (e.g., "80.0%")
 */
export function formatLLTV(lltv: string | bigint): string {
  const lltvNumber = Number(lltv) / 1e16; // Convert from wei to percentage
  return `${lltvNumber.toFixed(1)}%`;
}
