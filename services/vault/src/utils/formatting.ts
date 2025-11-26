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

/**
 * Format provider ID for display by truncating the middle
 * @param providerId - The full provider ID string
 * @returns Formatted provider name (e.g., "Provider 0x1234...5678")
 */
export function formatProviderName(providerId: string): string {
  return `Provider ${providerId.slice(0, 6)}...${providerId.slice(-4)}`;
}
