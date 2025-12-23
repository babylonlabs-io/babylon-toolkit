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
 * @returns Formatted number string with trailing zeros removed (e.g., "1.23" or "0")
 */
export function formatBtcValue(btcAmount: number, decimals = 8): string {
  if (btcAmount <= 0) return "0";
  const fixed = btcAmount.toFixed(decimals);
  return fixed.replace(/\.?0+$/, "");
}

/**
 * Format BTC amount for display with suffix
 * @param btcAmount - Amount in BTC (not satoshis). Zero or negative values return "0 BTC".
 * @param decimals - Number of decimal places (default: 8)
 * @returns Formatted string with trailing zeros removed (e.g., "1.23 BTC" or "0 BTC")
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

/**
 * Format a number amount for display with locale-aware formatting
 * @param amount - The numeric amount to format
 * @param maxDecimals - Maximum decimal places (default: 2)
 * @returns Formatted number string (e.g., "1,234.56" or "0")
 */
export function formatAmount(amount: number, maxDecimals = 2): string {
  if (amount <= 0) return "0";
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

/**
 * Format a date as "YYYY-MM-DD HH:mm:ss"
 * @param date - The date to format
 * @returns Formatted date string
 */
export function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
