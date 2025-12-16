/**
 * Hook for fetching user's Aave position data
 *
 * Fetches the user's active Aave position with live on-chain data.
 * Uses Aave's on-chain oracle prices for authoritative health factor and values.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

import { satoshiToBtcNumber } from "@/utils/btcConversion";

import {
  HEALTH_FACTOR_WARNING_THRESHOLD,
  POSITION_REFETCH_INTERVAL_MS,
} from "../constants";
import { useAaveConfig } from "../context";
import {
  getUserPositionsWithLiveData,
  type AavePositionWithLiveData,
} from "../services";
import { aaveValueToUsd, wadToNumber } from "../utils";

/**
 * Health factor status based on Aave liquidation threshold
 */
export type HealthFactorStatus = "safe" | "warning" | "danger" | "no_debt";

/**
 * Result interface for useAaveUserPosition hook
 *
 * Note: In the Babylon vault integration, users can only have ONE position
 * because there's only one collateral reserve (vBTC). The position key is
 * keccak256(user, reserveId) and there's a single BTC_VAULT_CORE_VBTC_RESERVE_ID.
 */
export interface UseAaveUserPositionResult {
  /** User's vBTC collateral position (null if no position) */
  position: AavePositionWithLiveData | null;
  /** Collateral amount in BTC (from indexer) */
  collateralBtc: number;
  /** Total collateral value in USD (from Aave oracle) */
  collateralValueUsd: number;
  /** Total debt value in USD (from Aave oracle) */
  debtValueUsd: number;
  /** Health factor as a number (1.0 = liquidation threshold, from Aave) */
  healthFactor: number | null;
  /** Health factor status for UI display */
  healthFactorStatus: HealthFactorStatus;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => Promise<void>;
}

/**
 * Determine health factor status for UI display
 */
function getHealthFactorStatus(
  healthFactor: number | null,
  hasDebt: boolean,
): HealthFactorStatus {
  if (!hasDebt) return "no_debt";
  if (healthFactor === null) return "safe";
  if (healthFactor < 1.0) return "danger";
  if (healthFactor < HEALTH_FACTOR_WARNING_THRESHOLD) return "warning";
  return "safe";
}

/**
 * Hook to fetch user's Aave position with live data
 *
 * Values are sourced from Aave's on-chain oracle prices, making them
 * authoritative for liquidation decisions.
 *
 * Also fetches debt positions for all borrowable reserves in the same call,
 * avoiding separate RPC calls when displaying borrowed assets.
 */
export function useAaveUserPosition(
  connectedAddress: string | undefined,
): UseAaveUserPositionResult {
  const {
    config,
    borrowableReserves,
    isLoading: configLoading,
  } = useAaveConfig();
  const spokeAddress = config?.btcVaultCoreSpokeAddress as Address | undefined;

  // Extract reserve IDs for fetching debt positions
  const borrowableReserveIds = useMemo(
    () => borrowableReserves.map((r) => r.reserveId),
    [borrowableReserves],
  );

  // Convert BigInt to string for React Query key serialization
  const borrowableReserveIdsKey = useMemo(
    () => borrowableReserveIds.map((id) => id.toString()),
    [borrowableReserveIds],
  );

  const {
    data: positions,
    isLoading: positionsLoading,
    error: positionsError,
    refetch,
  } = useQuery({
    queryKey: [
      "aaveUserPosition",
      connectedAddress,
      spokeAddress,
      borrowableReserveIdsKey,
    ],
    queryFn: () =>
      getUserPositionsWithLiveData(connectedAddress!, spokeAddress!, {
        borrowableReserveIds,
      }),
    enabled: !!connectedAddress && !!spokeAddress,
    refetchOnMount: true,
    refetchInterval: POSITION_REFETCH_INTERVAL_MS,
  });

  // User can only have one position (single vBTC collateral reserve)
  const position = positions?.[0] ?? null;

  // Derive values from position's account data (uses Aave oracle prices)
  const { collateralBtc, collateralValueUsd, debtValueUsd, healthFactor } =
    useMemo(() => {
      if (!position) {
        return {
          collateralBtc: 0,
          collateralValueUsd: 0,
          debtValueUsd: 0,
          healthFactor: null,
        };
      }

      const { accountData, totalCollateral } = position;

      return {
        collateralBtc: satoshiToBtcNumber(totalCollateral),
        collateralValueUsd: aaveValueToUsd(accountData.totalCollateralValue),
        debtValueUsd: aaveValueToUsd(accountData.totalDebtValue),
        healthFactor:
          accountData.borrowedCount > 0n
            ? wadToNumber(accountData.healthFactor)
            : null,
      };
    }, [position]);

  const healthFactorStatus = getHealthFactorStatus(
    healthFactor,
    debtValueUsd > 0,
  );

  return {
    position,
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    healthFactorStatus,
    isLoading: positionsLoading || configLoading,
    error: positionsError as Error | null,
    refetch: async () => void refetch(),
  };
}
