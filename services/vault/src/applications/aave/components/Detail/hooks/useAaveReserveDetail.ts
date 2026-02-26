/**
 * Hook for Aave reserve detail page data
 *
 * Fetches and combines:
 * - Reserve config from Aave
 * - User position data
 * - Asset metadata for display
 */

import { useMemo } from "react";
import { formatUnits } from "viem";

import { getTokenByAddress } from "@/services/token/tokenService";

import { useAaveConfig } from "../../../context";
import { useAaveUserPosition } from "../../../hooks";
import type { AaveReserveConfig } from "../../../services/fetchConfig";
import type { Asset } from "../../../types";

export interface UseAaveReserveDetailProps {
  /** Reserve symbol from URL param */
  reserveId: string | undefined;
  /** User's wallet address */
  address: string | undefined;
}

export interface UseAaveReserveDetailResult {
  /** Whether data is loading */
  isLoading: boolean;
  /** Selected reserve config (null if not found) */
  selectedReserve: AaveReserveConfig | null;
  /** Asset display config (null if reserve not found) */
  assetConfig: Asset | null;
  /** vBTC reserve config (for liquidation threshold) */
  vbtcReserve: AaveReserveConfig | null;
  /** Liquidation threshold in BPS */
  liquidationThresholdBps: number;
  /** User's proxy contract address (for debt queries) */
  proxyContract: string | undefined;
  /** Collateral value in USD */
  collateralValueUsd: number;
  /** Current debt amount for selected reserve in token units */
  currentDebtAmount: number;
  /** Total debt value in USD across all reserves */
  totalDebtValueUsd: number;
  /** Health factor (null if no debt) */
  healthFactor: number | null;
}

export function useAaveReserveDetail({
  reserveId,
  address,
}: UseAaveReserveDetailProps): UseAaveReserveDetailResult {
  // Fetch reserves from Aave config
  const {
    vbtcReserve,
    borrowableReserves,
    isLoading: configLoading,
  } = useAaveConfig();

  // Find the selected reserve by symbol (from URL param)
  const selectedReserve = useMemo(() => {
    if (!reserveId) return null;
    return (
      borrowableReserves.find(
        (r) => r.token.symbol.toLowerCase() === reserveId.toLowerCase(),
      ) ?? null
    );
  }, [borrowableReserves, reserveId]);

  // Build asset config from reserve
  const assetConfig = useMemo((): Asset | null => {
    if (!selectedReserve) return null;
    const tokenMetadata = getTokenByAddress(selectedReserve.token.address);
    return {
      name: selectedReserve.token.name,
      symbol: selectedReserve.token.symbol,
      icon: tokenMetadata?.icon ?? "",
    };
  }, [selectedReserve]);

  // Fetch user position from Aave (uses Aave oracle for USD values)
  const {
    position,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    isLoading: positionLoading,
  } = useAaveUserPosition(address);

  // Calculate debt amount for selected reserve in token units
  const currentDebtAmount = useMemo(() => {
    if (!selectedReserve || !position?.debtPositions) {
      return 0;
    }

    const debtPosition = position.debtPositions.get(selectedReserve.reserveId);
    if (!debtPosition) {
      return 0;
    }

    // Convert from bigint to number using token decimals
    return Number(
      formatUnits(debtPosition.totalDebt, selectedReserve.token.decimals),
    );
  }, [selectedReserve, position]);

  // Get liquidation threshold from vBTC reserve
  const liquidationThresholdBps = vbtcReserve?.reserve.collateralFactor ?? 0;

  return {
    isLoading: configLoading || positionLoading,
    selectedReserve,
    assetConfig,
    vbtcReserve,
    liquidationThresholdBps,
    proxyContract: position?.proxyContract,
    collateralValueUsd,
    currentDebtAmount,
    totalDebtValueUsd: debtValueUsd,
    healthFactor,
  };
}
