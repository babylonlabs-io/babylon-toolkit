/**
 * Repay state management hook
 *
 * Manages repay amount and tracks which repay path the user is invoking.
 * Uses explicit mode tracking instead of tolerance-based detection.
 */

import { useCallback, useMemo, useState } from "react";

import type { RepayMode } from "../../../../hooks/useRepayTransaction";

export interface UseRepayStateProps {
  /** Current debt amount for selected reserve in token units */
  currentDebtAmount: number;
  /** User's token balance for the selected reserve */
  userTokenBalance: number;
}

export interface UseRepayStateResult {
  repayAmount: number;
  /** Sets repay amount and resets mode to partial (used by typed input / slider) */
  setRepayAmount: (amount: number) => void;
  /** Sets repay amount and mode atomically (used by Max button) */
  setRepayAmountWithMode: (amount: number, mode: RepayMode) => void;
  resetRepayAmount: () => void;
  maxRepayAmount: number;
  /** Which repay path the current amount should use. Set explicitly. */
  repayMode: RepayMode;
  /** Whether the current repay clears the full debt (mode === "full"). */
  isFullRepayment: boolean;
}

export function useRepayState({
  currentDebtAmount,
  userTokenBalance,
}: UseRepayStateProps): UseRepayStateResult {
  const [repayAmount, setRepayAmountRaw] = useState(0);
  const [repayMode, setRepayMode] = useState<RepayMode>("partial");

  // Max repay is the minimum of debt and available balance
  const maxRepayAmount = useMemo(() => {
    return Math.max(0, Math.min(currentDebtAmount, userTokenBalance));
  }, [currentDebtAmount, userTokenBalance]);

  // Manual input / slider always sets partial mode
  const setRepayAmount = useCallback((amount: number) => {
    setRepayAmountRaw(amount);
    setRepayMode("partial");
  }, []);

  // Max button sets amount + mode atomically
  const setRepayAmountWithMode = useCallback(
    (amount: number, mode: RepayMode) => {
      setRepayAmountRaw(amount);
      setRepayMode(mode);
    },
    [],
  );

  const resetRepayAmount = useCallback(() => {
    setRepayAmountRaw(0);
    setRepayMode("partial");
  }, []);

  const isFullRepayment = repayMode === "full";

  return {
    repayAmount,
    setRepayAmount,
    setRepayAmountWithMode,
    resetRepayAmount,
    maxRepayAmount,
    repayMode,
    isFullRepayment,
  };
}
