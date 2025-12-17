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

import { useAddCollateralState } from "./useAddCollateralState";

export interface UseAddCollateralModalResult {
  /** Selected collateral amount in BTC */
  collateralAmount: number;
  /** Set the collateral amount */
  setCollateralAmount: (amount: number) => void;
  /** Maximum collateral amount (sum of available vaults) */
  maxCollateralAmount: number;
  /** Collateral value in USD for selected amount */
  selectedCollateralValueUsd: number;
  /** Current health factor value for UI (Infinity when no debt) */
  currentHealthFactorValue: number;
  /** Projected health factor value after adding collateral */
  projectedHealthFactorValue: number;
  /** Slider steps based on vault bucket combinations */
  collateralSteps: Array<{ value: number }>;
  /** Execute the add collateral transaction */
  handleDeposit: () => Promise<boolean>;
  /** Whether transaction is processing */
  isProcessing: boolean;
  /** Whether deposit button should be disabled */
  isDisabled: boolean;
}

/**
 * Hook that provides all state and handlers for the Add Collateral modal
 *
 * Fetches data using React Query (reuses cached data from parent components)
 * and provides transaction execution.
 */
export function useAddCollateralModal(): UseAddCollateralModalResult {
  // Fetch wallet address
  const { address } = useETHWallet();

  // Fetch BTC price (uses React Query cache)
  const { btcPriceUSD } = useBTCPrice();
  const btcPrice = btcPriceUSD || 0;

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
    btcPrice,
    currentHealthFactor: healthFactor,
  });

  // Transaction hook
  const { executeAddCollateral, isProcessing } = useAddCollateralTransaction();

  const handleDeposit = async () => {
    if (selectedVaultIds.length === 0) return false;
    return executeAddCollateral(selectedVaultIds);
  };

  const isDisabled = collateralAmount === 0 || isProcessing || configLoading;

  return {
    collateralAmount,
    setCollateralAmount,
    maxCollateralAmount,
    selectedCollateralValueUsd,
    currentHealthFactorValue,
    projectedHealthFactorValue,
    collateralSteps,
    handleDeposit,
    isProcessing,
    isDisabled,
  };
}
