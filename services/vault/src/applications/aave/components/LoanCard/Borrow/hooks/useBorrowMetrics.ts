/**
 * Borrow metrics calculation hook
 *
 * Calculates display metrics for borrow UI including projected health factor.
 * borrowAmount is in token units; converted to USD via tokenPriceUsd for calculations.
 */

import {
  calculateBorrowRatio,
  calculateHealthFactor,
  formatHealthFactor,
} from "../../../../utils";

export interface UseBorrowMetricsProps {
  /** Borrow amount in token units */
  borrowAmount: number;
  /** Collateral value in USD (from Aave oracle) */
  collateralValueUsd: number;
  /** Current debt in USD (from Aave oracle) */
  currentDebtUsd: number;
  /** vBTC liquidation threshold in BPS (e.g., 8000 = 80%) */
  liquidationThresholdBps: number;
  /** Current health factor (null if no debt) */
  currentHealthFactor: number | null;
  /** Price of the borrow token in USD */
  tokenPriceUsd: number;
}

export interface UseBorrowMetricsResult {
  /** Borrow rate (debt/collateral) as percentage string */
  borrowRatio: string;
  /** Original borrow rate shown when borrow amount > 0 to show before → after */
  borrowRatioOriginal?: string;
  healthFactor: string;
  /** Health factor value for UI (Infinity when no debt = healthy) */
  healthFactorValue: number;
  /** Original health factor shown when borrow amount > 0 to show before → after */
  healthFactorOriginal?: string;
  /** Original health factor value for UI (Infinity when no debt = healthy) */
  healthFactorOriginalValue?: number;
}

export function useBorrowMetrics({
  borrowAmount,
  collateralValueUsd,
  currentDebtUsd,
  liquidationThresholdBps,
  currentHealthFactor,
  tokenPriceUsd,
}: UseBorrowMetricsProps): UseBorrowMetricsResult {
  // When no borrow amount entered, show current values (no projection)
  if (borrowAmount === 0) {
    // Use Infinity when no debt - represents "infinitely healthy" for UI purposes
    const healthValue = currentHealthFactor ?? Infinity;
    return {
      borrowRatio: calculateBorrowRatio(currentDebtUsd, collateralValueUsd),
      borrowRatioOriginal: undefined,
      healthFactor: formatHealthFactor(currentHealthFactor),
      healthFactorValue: healthValue,
      healthFactorOriginal: undefined,
    };
  }

  // Calculate projected values after borrow (convert token units to USD)
  const totalDebtUsd = currentDebtUsd + borrowAmount * tokenPriceUsd;
  const healthFactorValue = calculateHealthFactor(
    collateralValueUsd,
    totalDebtUsd,
    liquidationThresholdBps,
  );

  // Use Infinity for original when no debt - represents "infinitely healthy"
  const originalHealthValue = currentHealthFactor ?? Infinity;

  return {
    borrowRatio: calculateBorrowRatio(totalDebtUsd, collateralValueUsd),
    borrowRatioOriginal: calculateBorrowRatio(
      currentDebtUsd,
      collateralValueUsd,
    ),
    healthFactor: formatHealthFactor(
      healthFactorValue > 0 ? healthFactorValue : null,
    ),
    healthFactorValue,
    healthFactorOriginal: formatHealthFactor(currentHealthFactor),
    healthFactorOriginalValue: originalHealthValue,
  };
}
