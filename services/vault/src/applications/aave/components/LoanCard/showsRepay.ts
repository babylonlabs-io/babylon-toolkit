import { LOAN_TAB, type LoanTab } from "../../constants";

/**
 * Whether `LoanCard` renders Repay. Repay shows only when the user actually
 * has a position; otherwise the card falls back to Borrow.
 */
export function showsRepay(
  tab: LoanTab,
  collateralValueUsd: number,
  totalDebtValueUsd: number,
): boolean {
  const hasPosition = totalDebtValueUsd > 0 || collateralValueUsd > 0;
  return tab === LOAN_TAB.REPAY && hasPosition;
}
