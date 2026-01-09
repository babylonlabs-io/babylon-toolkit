/**
 * Hook for Add Collateral modal
 *
 * Combines data fetching, state management, and transaction execution
 * for the Add Collateral modal. Uses React Query's cache for data.
 */

import { useMemo } from "react";

import type { DetailRow } from "@/components/shared";
import { useETHWallet } from "@/context/wallet";
import { usePrices } from "@/hooks/usePrices";

import { useAaveConfig } from "../../../context";
import {
  useAaveUserPosition,
  useAaveVaults,
  useAddCollateralTransaction,
} from "../../../hooks";
import { BorrowableAssetsValue, HealthFactorValue } from "../components";

import type { UseCollateralModalResult } from "./types";
import { useAddCollateralState } from "./useAddCollateralState";

/**
 * Hook that provides all state and handlers for the Add Collateral modal
 *
 * Fetches data using React Query (reuses cached data from parent components)
 * and provides transaction execution.
 */
export function useAddCollateralModal(): UseCollateralModalResult {
  // Fetch wallet address
  const { address } = useETHWallet();

  // Fetch BTC price (uses React Query cache)
  const { prices, isLoading: priceLoading } = usePrices();
  const btcPriceUSD = prices.BTC ?? 0;

  // Fetch user's position data (uses React Query cache)
  const { collateralValueUsd, debtValueUsd, healthFactor } =
    useAaveUserPosition(address);

  // Fetch vaults available for collateral (uses React Query cache)
  const { availableForCollateral } = useAaveVaults(address);

  // Get config from context
  const {
    vbtcReserve,
    borrowableReserves,
    isLoading: configLoading,
  } = useAaveConfig();
  const liquidationThresholdBps = vbtcReserve?.reserve.collateralFactor;

  // State for collateral selection and calculations
  const {
    collateralAmount,
    setCollateralAmount,
    maxCollateralAmount,
    selectedVaultIds,
    collateralValueUsd: selectedCollateralValueUsd,
    currentHealthFactorValue,
    projectedHealthFactorValue,
    collateralSteps,
  } = useAddCollateralState({
    availableVaults: availableForCollateral,
    currentCollateralUsd: collateralValueUsd,
    currentDebtUsd: debtValueUsd,
    liquidationThresholdBps,
    btcPrice: btcPriceUSD,
    currentHealthFactor: healthFactor,
  });

  // Transaction hook
  const { executeAddCollateral, isProcessing } = useAddCollateralTransaction();

  const handleSubmit = async () => {
    if (selectedVaultIds.length === 0) return false;
    return executeAddCollateral(selectedVaultIds);
  };

  const isDisabled =
    collateralAmount === 0 || isProcessing || configLoading || priceLoading;

  // Construct detail rows for display
  const detailRows: DetailRow[] = useMemo(() => {
    const rows: DetailRow[] = [
      { label: "Spoke", value: "Aave Prime" },
      {
        label: "Borrowable assets",
        value: <BorrowableAssetsValue reserves={borrowableReserves} />,
      },
    ];

    // Show health factor transition when collateral is selected
    const showProjected = collateralAmount > 0;
    rows.push({
      label: "Health Factor",
      value: (
        <HealthFactorValue
          current={currentHealthFactorValue}
          projected={showProjected ? projectedHealthFactorValue : undefined}
        />
      ),
    });

    return rows;
  }, [
    borrowableReserves,
    collateralAmount,
    currentHealthFactorValue,
    projectedHealthFactorValue,
  ]);

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
    errorMessage: undefined,
  };
}
