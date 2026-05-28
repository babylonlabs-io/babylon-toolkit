import {
  BPS_SCALE,
  MIN_HEALTH_FACTOR_FOR_BORROW,
  SAFE_TOFIXED_PRECISION,
} from "../../../../constants";

export interface CalculateMaxBorrowTokensParams {
  /** Collateral value in USD (from Aave oracle) */
  collateralValueUsd: number;
  /** Current debt in USD (from Aave oracle) */
  currentDebtUsd: number;
  /** Liquidation threshold in BPS (e.g., 8000 = 80%) */
  liquidationThresholdBps: number;
  /** Price of the borrow token in USD (null when oracle price is unavailable) */
  tokenPriceUsd: number | null;
  /** Native token decimals (e.g., 8 for WBTC, 6 for USDC, 18 for ETH) */
  tokenDecimals: number;
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
 * already exceeds borrowing capacity).
 *
 * Floored to min(tokenDecimals, SAFE_TOFIXED_PRECISION) so:
 *   1. High-priced tokens (e.g. WBTC at ~$75k) don't lose sub-cent
 *      precision and report Max 0 (was a 2-decimal floor).
 *   2. For 18-decimal tokens, the max never advertises precision below
 *      what `parseUnits(borrowAmount.toFixed(15), decimals)` can preserve
 *      in `useBorrowTransaction` — otherwise the Max button could set
 *      a value the execution path silently truncates to zero.
 */
export function calculateMaxBorrowTokens({
  collateralValueUsd,
  currentDebtUsd,
  liquidationThresholdBps,
  tokenPriceUsd,
  tokenDecimals,
}: CalculateMaxBorrowTokensParams): number {
  if (tokenPriceUsd == null || tokenPriceUsd <= 0) {
    return 0;
  }

  const maxTotalDebtUsd =
    (collateralValueUsd * liquidationThresholdBps) /
    BPS_SCALE /
    MIN_HEALTH_FACTOR_FOR_BORROW;
  const maxAdditionalBorrowUsd = maxTotalDebtUsd - currentDebtUsd;
  const maxBorrowTokens = maxAdditionalBorrowUsd / tokenPriceUsd;
  const floorDecimals = Math.min(tokenDecimals, SAFE_TOFIXED_PRECISION);
  const scale = 10 ** floorDecimals;
  return Math.floor(Math.max(0, maxBorrowTokens) * scale) / scale;
}
