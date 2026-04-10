import { BPS_SCALE, MIN_HEALTH_FACTOR_FOR_BORROW } from "../../../../constants";

export interface CalculateMaxBorrowTokensParams {
  /** Collateral value in USD (from Aave oracle) */
  collateralValueUsd: number;
  /** Current debt in USD (from Aave oracle) */
  currentDebtUsd: number;
  /** Liquidation threshold in BPS (e.g., 8000 = 80%) */
  liquidationThresholdBps: number;
  /** Price of the borrow token in USD */
  tokenPriceUsd: number;
}

/**
 * Max tokens a user can borrow while keeping health factor >=
 * MIN_HEALTH_FACTOR_FOR_BORROW.
 *
 * Derivation:
 *   HF = (collateral * LT) / totalDebt >= MIN_HF
 *   totalDebt <= (collateral * LT) / MIN_HF
 *   maxAdditionalBorrowUsd = (collateral * LT) / MIN_HF - currentDebt
 *   maxBorrowTokens = maxAdditionalBorrowUsd / tokenPriceUsd
 *
 * Returns 0 when the resulting value would be negative (existing debt
 * already exceeds borrowing capacity). Floored to 2 decimals so the
 * slider never offers sub-cent precision.
 */
export function calculateMaxBorrowTokens({
  collateralValueUsd,
  currentDebtUsd,
  liquidationThresholdBps,
  tokenPriceUsd,
}: CalculateMaxBorrowTokensParams): number {
  const maxTotalDebtUsd =
    (collateralValueUsd * liquidationThresholdBps) /
    BPS_SCALE /
    MIN_HEALTH_FACTOR_FOR_BORROW;
  const maxAdditionalBorrowUsd = maxTotalDebtUsd - currentDebtUsd;
  const maxBorrowTokens = maxAdditionalBorrowUsd / tokenPriceUsd;
  return Math.floor(Math.max(0, maxBorrowTokens) * 100) / 100;
}
