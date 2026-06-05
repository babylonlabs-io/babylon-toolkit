/**
 * Repay state management hook
 *
 * Tracks the current repay amount and whether the user invoked it via the
 * Max button. The repay *mode* (`full` / `max-capped` / `partial`) is
 * resolved at submit time from a fresh on-chain read — not here — to avoid
 * snapshotting stale balance/debt at click time and consuming it seconds
 * (or minutes) later at submit.
 */

import { useCallback, useMemo, useState } from "react";

import { SLIDER_STEP_COUNT } from "../../../../constants";

export interface UseRepayStateProps {
  /** Current debt amount for selected reserve in token units (cached). */
  currentDebtAmount: number;
  /** User's token balance for the selected reserve (cached). */
  userTokenBalance: number;
}

export interface UseRepayStateResult {
  repayAmount: number;
  /** Sets repay amount as a typed value; clears Max intent. */
  setRepayAmount: (amount: number) => void;
  /**
   * Sets repay amount from the slider. At (or one step short of) the max it
   * snaps to `maxRepayAmount` and marks Max intent — same as the Max button —
   * so submit refetches and clears the full debt instead of leaving accrued
   * dust from a stale partial amount. Below the top it's a partial repay.
   */
  setRepayAmountSlider: (amount: number) => void;
  /**
   * Sets repay amount as the cached `maxRepayAmount` and marks Max intent.
   * The submit path checks `isMaxIntent` and refetches fresh debt+balance
   * to decide the actual repay mode and final amount.
   */
  setRepayAmountMax: (amount: number) => void;
  resetRepayAmount: () => void;
  /**
   * Display-only ceiling derived from cached props. The true cap at submit
   * time is whatever the fresh on-chain read returns.
   */
  maxRepayAmount: number;
  /** True iff the user invoked the Max button and hasn't typed since. */
  isMaxIntent: boolean;
}

export function useRepayState({
  currentDebtAmount,
  userTokenBalance,
}: UseRepayStateProps): UseRepayStateResult {
  const [repayAmount, setRepayAmountFloat] = useState(0);
  const [isMaxIntent, setIsMaxIntent] = useState(false);

  // Max repay is the minimum of debt and available balance.
  const maxRepayAmount = useMemo(() => {
    return Math.max(0, Math.min(currentDebtAmount, userTokenBalance));
  }, [currentDebtAmount, userTokenBalance]);

  // Typed input always drops Max intent — submit treats it as a verbatim
  // partial repay rather than refetching to pick a mode.
  const setRepayAmount = useCallback((amount: number) => {
    setRepayAmountFloat(amount);
    setIsMaxIntent(false);
  }, []);

  // Slider input: the last reachable step counts as Max intent. The native
  // range input's far-right value can land one step (max / SLIDER_STEP_COUNT)
  // short of max due to float rounding, so use a one-step tolerance and snap
  // the display to the true max. Below the top it's a verbatim partial repay.
  const setRepayAmountSlider = useCallback(
    (amount: number) => {
      const atSliderMax =
        maxRepayAmount > 0 &&
        amount >= maxRepayAmount - maxRepayAmount / SLIDER_STEP_COUNT;
      if (atSliderMax) {
        setRepayAmountFloat(maxRepayAmount);
        setIsMaxIntent(true);
        return;
      }
      setRepayAmountFloat(amount);
      setIsMaxIntent(false);
    },
    [maxRepayAmount],
  );

  const setRepayAmountMax = useCallback((amount: number) => {
    setRepayAmountFloat(amount);
    setIsMaxIntent(true);
  }, []);

  const resetRepayAmount = useCallback(() => {
    setRepayAmountFloat(0);
    setIsMaxIntent(false);
  }, []);

  return {
    repayAmount,
    setRepayAmount,
    setRepayAmountSlider,
    setRepayAmountMax,
    resetRepayAmount,
    maxRepayAmount,
    isMaxIntent,
  };
}
