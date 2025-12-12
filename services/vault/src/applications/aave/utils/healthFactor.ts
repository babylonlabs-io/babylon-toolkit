/**
 * Health Factor Utilities for Aave
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
