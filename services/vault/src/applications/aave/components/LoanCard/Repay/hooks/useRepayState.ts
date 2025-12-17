/**
 * Repay state management hook
 *
 * Manages repay amount and calculates max repay based on current debt.
 */

import { useMemo, useState } from "react";

export interface UseRepayStateProps {
  currentDebtUsd: number;
}

export interface UseRepayStateResult {
  repayAmount: number;
  setRepayAmount: (amount: number) => void;
  maxRepayAmount: number;
}

export function useRepayState({
  currentDebtUsd,
}: UseRepayStateProps): UseRepayStateResult {
  const [repayAmount, setRepayAmount] = useState(0);

  const maxRepayAmount = useMemo(() => {
    return Math.floor(Math.max(0, currentDebtUsd) * 100) / 100;
  }, [currentDebtUsd]);

  return {
    repayAmount,
    setRepayAmount,
    maxRepayAmount,
  };
}
