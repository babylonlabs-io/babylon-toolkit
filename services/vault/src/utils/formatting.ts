/**
 * Formatting utilities for displaying values in the UI
 */

import { getNetworkConfigBTC } from "@/config";

const btcConfig = getNetworkConfigBTC();

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
 * Uses network-aware coin symbol (BTC for mainnet, sBTC for signet)
 * @param btcAmount - Amount in BTC (not satoshis). Zero or negative values return "0 BTC/sBTC".
 * @param decimals - Number of decimal places (default: 8)
 * @returns Formatted string with trailing zeros removed (e.g., "1.23 BTC" or "0 sBTC")
 */
export function formatBtcAmount(btcAmount: number, decimals = 8): string {
  return `${formatBtcValue(btcAmount, decimals)} ${btcConfig.coinSymbol}`;
}

/**
 * Get the current BTC coin symbol based on network
 * @returns "BTC" for mainnet, "sBTC" for signet
 */
export function getBtcSymbol(): string {
  return btcConfig.coinSymbol;
}

/**
 * Get the current BTC icon path based on network
 * @returns Icon path for the current network
 */
export function getBtcIcon(): string {
  return btcConfig.icon;
}

/**
 * Get the current BTC display name based on network
 * @returns "Bitcoin" for mainnet, "Signet Bitcoin" for signet
 */
export function getBtcName(): string {
  return btcConfig.name;
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
 * Format price in USD for compact display (without suffix)
 * Uses no decimals for values >= 1000, 2 decimals otherwise
 * @param priceUsd - Price in USD
 * @returns Formatted price string (e.g., "$1,234" or "$99.50")
 */
export function formatPriceUsd(priceUsd: number): string {
  if (priceUsd >= 1000) {
    return `$${priceUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  return `$${priceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
 * Parse a decimal amount input string and set the numeric value.
 * Handles empty strings, lone decimals, and non-numeric input gracefully.
 */
export function parseAmountInput(
  value: string,
  setAmount: (n: number) => void,
) {
  if (value === "" || value === ".") {
    setAmount(0);
    return;
  }
  const parsed = parseFloat(value);
  if (!isNaN(parsed)) {
    setAmount(parsed);
  }
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

/**
 * Format a timestamp as relative time (e.g., "5 minutes ago", "2 days ago")
 * @param timestamp - Timestamp in milliseconds since epoch. Future timestamps return "just now".
 * @returns Formatted relative time string
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 0) {
    return "just now";
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  // Note: We intentionally approximate months as 30 days and years as 365 days
  // for a simple, human-friendly relative time display. This does not account
  // for varying month lengths or leap years.
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) {
    return years === 1 ? "a year ago" : `${years} years ago`;
  }
  if (months > 0) {
    return months === 1 ? "a month ago" : `${months} months ago`;
  }
  if (days > 0) {
    return days === 1 ? "a day ago" : `${days} days ago`;
  }
  if (hours > 0) {
    return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  }
  if (minutes > 0) {
    return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`;
  }
  return "just now";
}

/**
 * Format token amount for display with appropriate precision.
 * Shows minimum 2 decimals, up to maxDecimals, trimming trailing zeros.
 *
 * @param amount - Token amount to format
 * @param maxDecimals - Maximum decimal places (default: 6 for stablecoins)
 * @returns Formatted string (e.g., "4.75" or "4.748593")
 */
export function formatTokenAmount(amount: number, maxDecimals = 6): string {
  if (amount === 0) return "0";

  // Format with max decimals, then trim trailing zeros
  const formatted = amount.toFixed(maxDecimals);
  // Remove trailing zeros but keep at least 2 decimal places
  const trimmed = formatted.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");

  // Ensure at least 2 decimal places for consistency
  const parts = trimmed.split(".");
  if (parts.length === 1) {
    return `${parts[0]}.00`;
  }
  if (parts[1].length === 1) {
    return `${parts[0]}.${parts[1]}0`;
  }
  return trimmed;
}
