/**
 * Hook for Add Collateral modal
 *
 * Combines data fetching, state management, and transaction execution
 * for the Add Collateral modal. Uses React Query's cache for data.
 */

import { useETHWallet } from "@/context/wallet";
import { useBTCPrice } from "@/hooks/useBTCPrice";

import { useAaveConfig } from "../../../context";
import {
  useAaveUserPosition,
  useAaveVaults,
  useAddCollateralTransaction,
} from "../../../hooks";

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
  const { btcPriceUSD, loading: priceLoading } = useBTCPrice();

  // Fetch user's position data (uses React Query cache)
  const { collateralValueUsd, debtValueUsd, healthFactor } =
    useAaveUserPosition(address);

  // Fetch vaults available for collateral (uses React Query cache)
  const { availableForCollateral } = useAaveVaults(address);

  // Get liquidation threshold from vBTC reserve config (from context)
  // collateralFactor is the liquidation threshold in BPS (e.g., 8000 = 80%)
  const { vbtcReserve, isLoading: configLoading } = useAaveConfig();
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

  return {
    collateralAmount,
    setCollateralAmount,
    maxCollateralAmount,
    selectedCollateralValueUsd,
    currentHealthFactorValue,
    projectedHealthFactorValue,
    collateralSteps,
    handleSubmit,
    isProcessing,
    isDisabled,
    errorMessage: undefined,
    currentDebtValueUsd: debtValueUsd,
  };
}
