/**
 * Repay metrics calculation hook
 *
 * Calculates display metrics for repay UI including projected health factor.
 * repayAmount is in token units; converted to USD via tokenPriceUsd for calculations.
 * Repaying improves the health factor.
 */

import {
  NEAR_ZERO_DEBT_DISPLAY_THRESHOLD,
  NEAR_ZERO_DEBT_RELATIVE_CAP_USD,
  NEAR_ZERO_DEBT_RELATIVE_THRESHOLD,
} from "../../../../constants";
import { calculateHealthFactor, formatHealthFactor } from "../../../../utils";

export interface UseRepayMetricsProps {
  /** Amount to repay in token units */
  repayAmount: number;
  /** Current debt for the selected reserve in token units */
  currentDebtAmount: number;
  /** Collateral value in USD (from Aave oracle) */
  collateralValueUsd: number;
  /** Total debt value in USD across all reserves (from Aave oracle) */
  totalDebtValueUsd: number;
  /** vBTC liquidation threshold in BPS (e.g., 8000 = 80%) */
  liquidationThresholdBps: number;
  /** Current health factor (null if no debt) */
  currentHealthFactor: number | null;
  /** Price of the repay token in USD (null when oracle price is unavailable) */
  tokenPriceUsd: number | null;
}

export interface UseRepayMetricsResult {
  /**
   * Current debt for the selected reserve in token units. Price-independent —
   * always available, even when the oracle price is stale.
   */
  debtCurrent: number;
  /**
   * Projected debt after the repayment, in token units. Undefined when no
   * amount is entered (the card then shows only the current debt, no arrow).
   */
  debtProjected?: number;
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
  currentDebtAmount,
  collateralValueUsd,
  totalDebtValueUsd,
  liquidationThresholdBps,
  currentHealthFactor,
  tokenPriceUsd,
}: UseRepayMetricsProps): UseRepayMetricsResult {
  // Debt is pure token-unit math (no oracle price needed), so it projects even
  // when the price is stale/unavailable. Projection only when an amount is set;
  // repaying past the full debt clamps to zero rather than going negative.
  const debtCurrent = currentDebtAmount;
  const debtProjected =
    repayAmount > 0 ? Math.max(0, currentDebtAmount - repayAmount) : undefined;

  // The health-factor projection needs the USD price. Without an amount or a
  // price, show the current health factor only (no before → after).
  if (repayAmount === 0 || tokenPriceUsd == null) {
    const healthValue = currentHealthFactor ?? Infinity;
    return {
      debtCurrent,
      debtProjected,
      healthFactor: formatHealthFactor(currentHealthFactor),
      healthFactorValue: healthValue,
      healthFactorOriginal: undefined,
    };
  }

  // Convert token units to USD for debt projection
  const projectedTotalDebtUsd = Math.max(
    0,
    totalDebtValueUsd - repayAmount * tokenPriceUsd,
  );
  const nearZeroAbsoluteThreshold = Math.max(
    NEAR_ZERO_DEBT_DISPLAY_THRESHOLD,
    Math.min(
      totalDebtValueUsd * NEAR_ZERO_DEBT_RELATIVE_THRESHOLD,
      NEAR_ZERO_DEBT_RELATIVE_CAP_USD,
    ),
  );
  const isDebtNearZero = projectedTotalDebtUsd < nearZeroAbsoluteThreshold;

  const healthFactorValue = isDebtNearZero
    ? Infinity
    : calculateHealthFactor(
        collateralValueUsd,
        projectedTotalDebtUsd,
        liquidationThresholdBps,
      );

  const originalHealthValue = currentHealthFactor ?? Infinity;

  return {
    debtCurrent,
    debtProjected,
    healthFactor:
      healthFactorValue === Infinity
        ? "-"
        : formatHealthFactor(healthFactorValue),
    healthFactorValue,
    healthFactorOriginal: isDebtNearZero
      ? undefined
      : formatHealthFactor(currentHealthFactor),
    healthFactorOriginalValue: isDebtNearZero ? undefined : originalHealthValue,
  };
}
