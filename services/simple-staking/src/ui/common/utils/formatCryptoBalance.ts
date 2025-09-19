/**
 * Format balance with proper handling for small amounts
 * @param amount The amount to format
 * @param coinSymbol The coin symbol (e.g., 'BTC', 'BBN')
 * @param minDisplayAmount The minimum amount below which to show "<minDisplayAmount" (default: 0.01)
 * @returns Formatted balance string
 */
export function formatBalance(
  amount: number,
  coinSymbol: string,
  minDisplayAmount: number = 0.01,
): string {
  if (amount === 0) return `0 ${coinSymbol}`;

  // For very small amounts, display as "<minDisplayAmount"
  if (amount > 0 && amount < minDisplayAmount) {
    return `<${minDisplayAmount} ${coinSymbol}`;
  }

  // For amounts >= 1, show 2-4 decimals
  if (amount >= 1) {
    return `${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })} ${coinSymbol}`;
  }

  // For amounts between minDisplayAmount and 1, show up to 8 decimals but remove trailing zeros
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });

  // Remove trailing zeros after decimal point (but keep the decimal point if needed)
  const trimmed = formatted.replace(/\.?0+$/, "");

  return `${trimmed} ${coinSymbol}`;
}
