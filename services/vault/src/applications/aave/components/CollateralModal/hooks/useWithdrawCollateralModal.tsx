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

import type { DetailRow } from "@/components/shared";
import { useETHWallet } from "@/context/wallet";
import { usePrices } from "@/hooks/usePrices";
import { PEGIN_DISPLAY_LABELS } from "@/models/peginStateMachine";
import { formatUsdValue } from "@/utils/formatting";

import { useAaveUserPosition, useAaveVaults } from "../../../hooks";
import { useWithdrawCollateralTransaction } from "../../../hooks/useWithdrawCollateralTransaction";
import { HealthFactorValue } from "../components";

import type { UseCollateralModalResult } from "./types";

/**
 * Hook that provides all state and handlers for the Withdraw Collateral modal
 *
 * Fetches data using React Query (reuses cached data from parent components)
 * and provides transaction execution.
 */
export function useWithdrawCollateralModal(): UseCollateralModalResult {
  const { address } = useETHWallet();
  const { prices, isLoading: priceLoading } = usePrices();
  const btcPriceUSD = prices.BTC ?? 0;

  const { collateralBtc, debtValueUsd, healthFactor } =
    useAaveUserPosition(address);

  // Get vaults to identify which ones are currently in use as collateral
  const { vaults } = useAaveVaults(address);
  const inUseVaultIds = useMemo(
    () =>
      vaults
        .filter((v) => v.status === PEGIN_DISPLAY_LABELS.IN_USE)
        .map((v) => v.id),
    [vaults],
  );

  const [collateralAmount, setCollateralAmount] = useState(0);

  const { executeWithdraw, isProcessing } = useWithdrawCollateralTransaction();

  // For withdraw, max is the total collateral currently deposited
  const maxCollateralAmount = collateralBtc;

  // Collateral value in USD for the selected withdrawal amount
  const selectedCollateralValueUsd = useMemo(() => {
    return collateralAmount * (btcPriceUSD ?? 0);
  }, [collateralAmount, btcPriceUSD]);

  // Current health factor (Infinity when no debt)
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
    return executeWithdraw(inUseVaultIds);
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

  // Construct detail rows for display
  const detailRows: DetailRow[] = useMemo(() => {
    const rows: DetailRow[] = [{ label: "Spoke", value: "Aave Prime" }];

    // Show current debt (for withdraw mode)
    rows.push({
      label: "Current Debt",
      value: formatUsdValue(debtValueUsd),
    });

    // Health factor without transition (for withdraw, it stays at Infinity)
    rows.push({
      label: "Health Factor",
      value: <HealthFactorValue current={currentHealthFactorValue} />,
    });

    return rows;
  }, [debtValueUsd, currentHealthFactorValue]);

  return {
    collateralAmount,
    setCollateralAmount,
    maxCollateralAmount,
    selectedCollateralValueUsd,
    collateralSteps,
    detailRows,
    handleSubmit,
    isProcessing,
    isDisabled,
    errorMessage,
  };
}
