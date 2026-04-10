/**
 * Repay state management hook
 *
 * Manages repay amount and calculates max repay based on current debt in token units.
 */

import { useMemo, useState } from "react";

import { FULL_REPAY_TOLERANCE } from "../../../../constants";

export interface UseRepayStateProps {
  /** Current debt amount for selected reserve in token units */
  currentDebtAmount: number;
  /** User's token balance for the selected reserve */
  userTokenBalance: number;
}

export interface UseRepayStateResult {
  repayAmount: number;
  setRepayAmount: (amount: number) => void;
  resetRepayAmount: () => void;
  maxRepayAmount: number;
  /** Whether the current repay amount represents a full repayment */
  isFullRepayment: boolean;
}

export function useRepayState({
  currentDebtAmount,
  userTokenBalance,
}: UseRepayStateProps): UseRepayStateResult {
  const [repayAmount, setRepayAmount] = useState(0);

  // Max repay is the minimum of debt and available balance
  const maxRepayAmount = useMemo(() => {
    return Math.max(0, Math.min(currentDebtAmount, userTokenBalance));
  }, [currentDebtAmount, userTokenBalance]);

  // Full repayment only when repay amount covers the actual debt, not the balance-capped max.
  // When balance < debt, pressing Max should route to partial repay, not full repay.
  const isFullRepayment = useMemo(() => {
    return (
      currentDebtAmount > 0 &&
      Math.abs(repayAmount - currentDebtAmount) < FULL_REPAY_TOLERANCE
    );
  }, [repayAmount, currentDebtAmount]);

  const resetRepayAmount = () => setRepayAmount(0);

  return {
    repayAmount,
    setRepayAmount,
    resetRepayAmount,
    maxRepayAmount,
    isFullRepayment,
  };
}
