/**
 * Hook for Withdraw Collateral modal
 *
 * Combines data fetching, state management, and transaction execution
 * for the Withdraw Collateral modal.
 *
 * Note: Aave only supports withdrawing ALL collateral at once.
 * Position must have zero debt to withdraw.
 */

import { useMemo, useState } from "react";

import { useETHWallet } from "@/context/wallet";
import { useBTCPrice } from "@/hooks/useBTCPrice";

import { useAaveUserPosition } from "../../../hooks";
import { useWithdrawCollateralTransaction } from "../../../hooks/useWithdrawCollateralTransaction";

import type { UseCollateralModalResult } from "./types";

/**
 * Hook that provides all state and handlers for the Withdraw Collateral modal
 *
 * Fetches data using React Query (reuses cached data from parent components)
 * and provides transaction execution.
 */
export function useWithdrawCollateralModal(): UseCollateralModalResult {
  const { address } = useETHWallet();
  const { btcPriceUSD, loading: priceLoading } = useBTCPrice();

  const { collateralBtc, debtValueUsd, healthFactor } =
    useAaveUserPosition(address);

  const [collateralAmount, setCollateralAmount] = useState(0);

  const { executeWithdraw, isProcessing } = useWithdrawCollateralTransaction();

  // For withdraw, max is the total collateral currently deposited
  const maxCollateralAmount = collateralBtc;

  // Collateral value in USD for the selected withdrawal amount
  const selectedCollateralValueUsd = useMemo(() => {
    return collateralAmount * (btcPriceUSD ?? 0);
  }, [collateralAmount, btcPriceUSD]);

  // Current health factor (Infinity when no debt)
  // For withdraw, projected equals current because Aave only allows
  // withdrawing all collateral when debt is zero
  const currentHealthFactorValue = healthFactor ?? Infinity;

  // For withdraw, the only valid step is 0 or max (all-or-nothing)
  // Since Aave only supports withdrawing all collateral at once
  const collateralSteps = useMemo(() => {
    if (maxCollateralAmount <= 0) return [{ value: 0 }];
    return [{ value: 0 }, { value: maxCollateralAmount }];
  }, [maxCollateralAmount]);

  const handleSubmit = async () => {
    // Must withdraw all collateral
    if (collateralAmount <= 0) return false;
    return executeWithdraw();
  };

  // Disabled if:
  // - No collateral selected
  // - Processing
  // - Price not loaded
  // - Has debt (must repay first)
  // - Not withdrawing full amount (Aave only supports all-or-nothing)
  const hasDebt = debtValueUsd > 0;
  const isFullWithdrawal = collateralAmount === maxCollateralAmount;
  const isDisabled =
    collateralAmount === 0 ||
    isProcessing ||
    priceLoading ||
    hasDebt ||
    !isFullWithdrawal;

  // Error message when user has debt
  const errorMessage = hasDebt
    ? "You must repay all debt before withdrawing collateral"
    : undefined;

  return {
    collateralAmount,
    setCollateralAmount,
    maxCollateralAmount,
    selectedCollateralValueUsd,
    currentHealthFactorValue,
    projectedHealthFactorValue: currentHealthFactorValue,
    collateralSteps,
    handleSubmit,
    isProcessing,
    isDisabled,
    errorMessage,
    currentDebtValueUsd: debtValueUsd,
  };
}
