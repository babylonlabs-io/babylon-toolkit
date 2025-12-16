/**
 * Health Factor Utilities for Aave
 *
 * Health factor is calculated by Aave on-chain using oracle prices.
 * A health factor below 1.0 means the position can be liquidated.
 * Health factor >= 1.0 is considered healthy.
 */

import { BPS_SCALE } from "../constants";

/**
 * Format health factor number for display
 *
 * @param healthFactor - Health factor number (null if no debt)
 * @returns Formatted string for display
 */
export function formatHealthFactor(healthFactor: number | null): string {
  if (healthFactor === null) {
    return "-"; // No debt
  }
  return healthFactor.toFixed(2);
}

/**
 * Checks if a health factor value represents a healthy position.
 *
 * @param healthFactor - The health factor as a number
 * @returns true if the health factor is >= 1.0 (healthy), false otherwise
 */
export function isHealthFactorHealthy(healthFactor: number | null): boolean {
  if (healthFactor === null) {
    return true; // No debt = healthy
  }
  return healthFactor >= 1.0;
}

/**
 * Calculate health factor
 * HF = (Collateral * Liquidation Threshold) / Total Debt
 *
 * @param collateralValueUsd - Collateral value in USD
 * @param totalDebtUsd - Total debt in USD
 * @param liquidationThresholdBps - Liquidation threshold in basis points (e.g., 8000 = 80%)
 * @returns Health factor value, or 0 if no debt
 */
export function calculateHealthFactor(
  collateralValueUsd: number,
  totalDebtUsd: number,
  liquidationThresholdBps: number,
): number {
  if (totalDebtUsd <= 0) return 0;
  return (
    (collateralValueUsd * (liquidationThresholdBps / BPS_SCALE)) / totalDebtUsd
  );
}
