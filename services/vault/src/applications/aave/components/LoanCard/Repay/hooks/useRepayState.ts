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
  /**
   * Optional exact raw amount (in the token's smallest unit) corresponding
   * to `repayAmount`. Set by the Max button in `"max-capped"` mode so the
   * downstream tx uses the exact on-chain bigint balance and avoids the
   * float round-trip — which, for ≥16-significant-digit raw values (any
   * 18-decimal token with > ~10 tokens in the wallet), can round up by 1
   * ULP and produce an approval larger than the user's balance.
   */
  repayAmountRaw: bigint | null;
  /** Sets repay amount and resets mode to partial (used by typed input / slider) */
  setRepayAmount: (amount: number) => void;
  /**
   * Sets repay amount and mode atomically (used by Max button).
   * Pass `amountRaw` to record the exact bigint amount — recommended in
   * `"max-capped"` mode where rounding direction matters.
   */
  setRepayAmountWithMode: (
    amount: number,
    mode: RepayMode,
    amountRaw?: bigint,
  ) => void;
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
  const [repayAmount, setRepayAmountFloat] = useState(0);
  const [repayMode, setRepayMode] = useState<RepayMode>("partial");
  const [repayAmountRaw, setRepayAmountRawBigInt] = useState<bigint | null>(
    null,
  );

  // Max repay is the minimum of debt and available balance
  const maxRepayAmount = useMemo(() => {
    return Math.max(0, Math.min(currentDebtAmount, userTokenBalance));
  }, [currentDebtAmount, userTokenBalance]);

  // Manual input / slider always sets partial mode and drops the raw bigint
  // (it only applies to the Max-button path).
  const setRepayAmount = useCallback((amount: number) => {
    setRepayAmountFloat(amount);
    setRepayMode("partial");
    setRepayAmountRawBigInt(null);
  }, []);

  // Max button sets amount + mode atomically. `amountRaw` is optional but
  // strongly recommended in "max-capped" mode.
  const setRepayAmountWithMode = useCallback(
    (amount: number, mode: RepayMode, amountRaw?: bigint) => {
      setRepayAmountFloat(amount);
      setRepayMode(mode);
      setRepayAmountRawBigInt(amountRaw ?? null);
    },
    [],
  );

  const resetRepayAmount = useCallback(() => {
    setRepayAmountFloat(0);
    setRepayMode("partial");
    setRepayAmountRawBigInt(null);
  }, []);

  const isFullRepayment = repayMode === "full";

  return {
    repayAmount,
    repayAmountRaw,
    setRepayAmount,
    setRepayAmountWithMode,
    resetRepayAmount,
    maxRepayAmount,
    repayMode,
    isFullRepayment,
  };
}
