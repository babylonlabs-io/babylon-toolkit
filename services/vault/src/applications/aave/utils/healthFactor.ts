/**
 * Health Factor Utilities for Aave
 *
 * Health factor is calculated by Aave on-chain using oracle prices.
 * A health factor below 1.0 means the position can be liquidated.
 * Health factor >= 1.0 is considered healthy.
 */

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
