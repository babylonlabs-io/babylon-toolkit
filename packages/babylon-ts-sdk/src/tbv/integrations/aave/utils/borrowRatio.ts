/**
 * Borrow Ratio Utilities
 *
 * Borrow ratio = debt / collateral as a percentage.
 * Shows how much of the collateral is being used for borrowing.
 */

/**
 * Calculate borrow ratio (debt / collateral) as percentage string
 *
 * @param debtUsd - Total debt in USD
 * @param collateralValueUsd - Total collateral value in USD
 * @returns Formatted percentage string (e.g., "15.7%")
 */
export function calculateBorrowRatio(
  debtUsd: number,
  collateralValueUsd: number,
): string {
  if (collateralValueUsd <= 0) return "0%";
  const ratio = (debtUsd / collateralValueUsd) * 100;
  return `${ratio.toFixed(1)}%`;
}
