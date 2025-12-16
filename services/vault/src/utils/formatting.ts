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

/**
 * Format BTC amount as a number string (without suffix)
 * @param btcAmount - Amount in BTC (not satoshis). Zero or negative values return "0".
 * @param decimals - Number of decimal places (default: 8)
 * @returns Formatted number string (e.g., "1.23456789" or "0")
 */
export function formatBtcValue(btcAmount: number, decimals = 8): string {
  if (btcAmount <= 0) return "0";
  return btcAmount.toFixed(decimals);
}

/**
 * Format BTC amount for display with suffix
 * @param btcAmount - Amount in BTC (not satoshis). Zero or negative values return "0 BTC".
 * @param decimals - Number of decimal places (default: 8)
 * @returns Formatted string (e.g., "1.23456789 BTC" or "0 BTC")
 */
export function formatBtcAmount(btcAmount: number, decimals = 8): string {
  return `${formatBtcValue(btcAmount, decimals)} BTC`;
}

/**
 * Format USD value for display
 * @param usdValue - Amount in USD. Zero or negative values return "$0 USD".
 * @returns Formatted string (e.g., "$1,234.56 USD" or "$0 USD")
 */
export function formatUsdValue(usdValue: number): string {
  if (usdValue <= 0) return "$0 USD";
  return `$${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}
