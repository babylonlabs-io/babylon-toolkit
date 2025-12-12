/**
 * Position calculation utilities
 *
 * Pure functions for calculating collateral and debt values from position data.
 */

import { USDC_DECIMALS } from "../constants";

/**
 * Calculate debt value in USD from shares
 *
 * Note: In Aave v4, shares need to be converted to assets using the Hub.
 * This uses an approximation where shares ≈ assets (accurate when interest
 * accrual is minimal).
 *
 * @param drawnShares - Principal debt shares
 * @param premiumShares - Accrued interest shares
 */
export function calculateDebtValueUsd(
  drawnShares: bigint,
  premiumShares: bigint,
): number {
  const totalDebtShares = drawnShares + premiumShares;
  return Number(totalDebtShares) / 10 ** USDC_DECIMALS;
}

/**
 * Convert liquidation threshold from BPS to percentage
 *
 * @param collateralRiskBps - Collateral risk in basis points (e.g., 8000 = 80%)
 * @returns Percentage value (e.g., 80)
 */
export function liquidationThresholdFromBps(collateralRiskBps: number): number {
  return collateralRiskBps / 100;
}
