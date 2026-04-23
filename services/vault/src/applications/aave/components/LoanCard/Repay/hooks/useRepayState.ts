/**
 * Repay state management hook
 *
 * Manages repay amount and calculates max repay based on current debt in token units.
 * Uses explicit mode tracking ("partial" | "full") instead of tolerance-based detection.
 */

import { useCallback, useMemo, useState } from "react";

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
  setRepayAmountWithMode: (amount: number, mode: "partial" | "full") => void;
  resetRepayAmount: () => void;
  maxRepayAmount: number;
  /** Whether the current repay represents a full repayment (set explicitly, not by tolerance) */
  isFullRepayment: boolean;
}

export function useRepayState({
  currentDebtAmount,
  userTokenBalance,
}: UseRepayStateProps): UseRepayStateResult {
  const [repayAmount, setRepayAmountRaw] = useState(0);
  const [repayMode, setRepayMode] = useState<"partial" | "full">("partial");

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
    (amount: number, mode: "partial" | "full") => {
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
    isFullRepayment,
  };
}
