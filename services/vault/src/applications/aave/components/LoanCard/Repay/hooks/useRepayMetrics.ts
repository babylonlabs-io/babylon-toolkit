/**
 * Repay metrics calculation hook
 *
 * Calculates display metrics for repay UI including projected health factor.
 * Uses USD values directly from Aave oracle.
 * Repaying improves the health factor.
 */

import {
  calculateBorrowRatio,
  calculateHealthFactor,
  formatHealthFactor,
} from "../../../../utils";

export interface UseRepayMetricsProps {
  repayAmount: number;
  /** Collateral value in USD (from Aave oracle) */
  collateralValueUsd: number;
  /** Current debt in USD (from Aave oracle) */
  currentDebtUsd: number;
  /** vBTC liquidation threshold in BPS (e.g., 8000 = 80%) */
  liquidationThresholdBps: number;
  /** Current health factor (null if no debt) */
  currentHealthFactor: number | null;
}

export interface UseRepayMetricsResult {
  /** Borrow rate (debt/collateral) as percentage string */
  borrowRatio: string;
  /** Original borrow rate shown when repay amount > 0 to show before → after */
  borrowRatioOriginal?: string;
  healthFactor: string;
  /** Health factor value for UI (Infinity when no debt = healthy) */
  healthFactorValue: number;
  /** Original health factor shown when repay amount > 0 to show before → after */
  healthFactorOriginal?: string;
  /** Original health factor value for UI (Infinity when no debt = healthy) */
  healthFactorOriginalValue?: number;
}

export function useRepayMetrics({
  repayAmount,
  collateralValueUsd,
  currentDebtUsd,
  liquidationThresholdBps,
  currentHealthFactor,
}: UseRepayMetricsProps): UseRepayMetricsResult {
  // When no repay amount entered, show current values (no projection)
  if (repayAmount === 0) {
    const healthValue = currentHealthFactor ?? Infinity;
    return {
      borrowRatio: calculateBorrowRatio(currentDebtUsd, collateralValueUsd),
      borrowRatioOriginal: undefined,
      healthFactor: formatHealthFactor(currentHealthFactor),
      healthFactorValue: healthValue,
      healthFactorOriginal: undefined,
    };
  }

  // Calculate projected values after repay (debt decreases)
  const totalDebtUsd = Math.max(0, currentDebtUsd - repayAmount);

  // If fully repaying, health factor becomes null (no debt)
  const healthFactorValue =
    totalDebtUsd > 0
      ? calculateHealthFactor(
          collateralValueUsd,
          totalDebtUsd,
          liquidationThresholdBps,
        )
      : Infinity;

  const originalHealthValue = currentHealthFactor ?? Infinity;

  return {
    borrowRatio: calculateBorrowRatio(totalDebtUsd, collateralValueUsd),
    borrowRatioOriginal: calculateBorrowRatio(
      currentDebtUsd,
      collateralValueUsd,
    ),
    healthFactor:
      healthFactorValue === Infinity
        ? "-"
        : formatHealthFactor(healthFactorValue),
    healthFactorValue,
    healthFactorOriginal: formatHealthFactor(currentHealthFactor),
    healthFactorOriginalValue: originalHealthValue,
  };
}
