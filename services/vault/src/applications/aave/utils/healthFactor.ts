/**
 * Health Factor Utilities for Aave
 *
 * Health Factor = (Collateral Value * Liquidation Threshold) / Total Debt
 *
 * In Aave, a health factor below 1.0 means the position can be liquidated.
 * Health factor >= 1.0 is considered healthy.
 */

/**
 * Checks if a health factor value represents a healthy position.
 *
 * @param healthFactor - The health factor as a string
 * @returns true if the health factor is >= 1.0 (healthy), false otherwise
 */
export function isHealthFactorHealthy(healthFactor: string): boolean {
  const healthFactorNum = parseFloat(healthFactor);
  return !isNaN(healthFactorNum) && healthFactorNum >= 1.0;
}

/**
 * Parameters for health factor calculation
 */
export interface HealthFactorParams {
  /** Collateral value in USD */
  collateralValueUsd: number;
  /** Total debt value in USD */
  debtValueUsd: number;
  /** Liquidation threshold as a percentage (0-100) */
  liquidationThreshold: number;
}

/**
 * Result of health factor calculation
 */
export interface HealthFactorResult {
  /** Health factor value (Infinity if no debt) */
  value: number;
  /** Formatted health factor string */
  formatted: string;
  /** Whether the position is healthy (>= 1.0) */
  isHealthy: boolean;
}

/**
 * Calculate health factor for an Aave position
 *
 * Formula: Health Factor = (Collateral Value * Liquidation Threshold) / Total Debt
 *
 * @param params - Health factor calculation parameters
 * @returns Health factor result with value, formatted string, and health status
 */
export function calculateHealthFactor(
  params: HealthFactorParams,
): HealthFactorResult {
  const { collateralValueUsd, debtValueUsd, liquidationThreshold } = params;

  // No debt means infinite health factor (position cannot be liquidated)
  if (debtValueUsd <= 0) {
    return {
      value: Infinity,
      formatted: "-",
      isHealthy: true,
    };
  }

  // No collateral with debt means position is at risk
  if (collateralValueUsd <= 0) {
    return {
      value: 0,
      formatted: "0.00",
      isHealthy: false,
    };
  }

  // Calculate health factor
  // liquidationThreshold is in percentage (e.g., 80 for 80%)
  const healthFactor =
    (collateralValueUsd * (liquidationThreshold / 100)) / debtValueUsd;

  return {
    value: healthFactor,
    formatted: healthFactor.toFixed(2),
    isHealthy: healthFactor >= 1.0,
  };
}
