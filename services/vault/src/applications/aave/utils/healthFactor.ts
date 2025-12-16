/**
 * Health Factor Utilities for Aave
 *
 * Health factor is calculated by Aave on-chain using oracle prices.
 * A health factor below 1.0 means the position can be liquidated.
 *
 * Status thresholds:
 * - no_debt: No active debt (null health factor)
 * - danger: < 1.0 (can be liquidated)
 * - warning: < HEALTH_FACTOR_WARNING_THRESHOLD (at risk)
 * - safe: >= HEALTH_FACTOR_WARNING_THRESHOLD (healthy)
 *
 * Color mapping:
 * - Green (#00E676): safe
 * - Amber (#FFC400): warning
 * - Red (#FF1744): danger
 * - Gray (#5A5A5A): no_debt
 */

import { BPS_SCALE, HEALTH_FACTOR_WARNING_THRESHOLD } from "../constants";

export const HEALTH_FACTOR_COLORS = {
  GREEN: "#00E676",
  AMBER: "#FFC400",
  RED: "#FF1744",
  GRAY: "#5A5A5A",
} as const;

export type HealthFactorColor =
  (typeof HEALTH_FACTOR_COLORS)[keyof typeof HEALTH_FACTOR_COLORS];

/**
 * Health factor status based on our liquidation threshold
 */
export type HealthFactorStatus = "safe" | "warning" | "danger" | "no_debt";

/**
 * Determine health factor status for UI display
 *
 * @param healthFactor - The health factor as a number (null if no debt)
 * @param hasDebt - Whether the position has active debt
 * @returns The status classification
 */
export function getHealthFactorStatus(
  healthFactor: number | null,
  hasDebt: boolean,
): HealthFactorStatus {
  if (!hasDebt) return "no_debt";
  if (healthFactor === null) return "safe";
  if (healthFactor < 1.0) return "danger";
  if (healthFactor < HEALTH_FACTOR_WARNING_THRESHOLD) return "warning";
  return "safe";
}

/**
 * Gets the appropriate color for a health factor status.
 *
 * @param status - The health factor status
 * @returns The color code for the status
 */
export function getHealthFactorColor(
  status: HealthFactorStatus,
): HealthFactorColor {
  switch (status) {
    case "safe":
      return HEALTH_FACTOR_COLORS.GREEN;
    case "warning":
      return HEALTH_FACTOR_COLORS.AMBER;
    case "danger":
      return HEALTH_FACTOR_COLORS.RED;
    case "no_debt":
      return HEALTH_FACTOR_COLORS.GRAY;
  }
}

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
