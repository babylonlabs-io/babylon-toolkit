/**
 * Repay state management hook
 *
 * Manages repay amount and calculates max repay based on current debt.
 */

import { useMemo, useState } from "react";

import { FULL_REPAY_TOLERANCE } from "../../../../constants";

export interface UseRepayStateProps {
  currentDebtUsd: number;
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
  currentDebtUsd,
}: UseRepayStateProps): UseRepayStateResult {
  const [repayAmount, setRepayAmount] = useState(0);

  const maxRepayAmount = useMemo(() => {
    return Math.floor(Math.max(0, currentDebtUsd) * 100) / 100;
  }, [currentDebtUsd]);

  // Determine if this is a full repayment (within tolerance for floating point)
  const isFullRepayment = useMemo(() => {
    return (
      maxRepayAmount > 0 &&
      Math.abs(repayAmount - maxRepayAmount) < FULL_REPAY_TOLERANCE
    );
  }, [repayAmount, maxRepayAmount]);

  const resetRepayAmount = () => setRepayAmount(0);

  return {
    repayAmount,
    setRepayAmount,
    resetRepayAmount,
    maxRepayAmount,
    isFullRepayment,
  };
}
