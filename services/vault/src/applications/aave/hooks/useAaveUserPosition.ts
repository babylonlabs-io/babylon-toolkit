/**
 * Hook for fetching user's Aave position data
 *
 * Fetches the user's active Aave position with live on-chain data.
 * Uses Aave's on-chain oracle prices for authoritative health factor and values.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { satoshiToBtcNumber } from "@/utils/btcConversion";

import {
  POSITION_REFETCH_INTERVAL_MS,
  POSITION_STALENESS_THRESHOLD_MS,
} from "../constants";
import { useAaveConfig } from "../context";
import {
  getUserPositionsWithLiveData,
  type AavePositionWithLiveData,
} from "../services";
import {
  aaveRayValueToUsd,
  aaveValueToUsd,
  getHealthFactorStatus,
  wadToNumber,
  type HealthFactorStatus,
} from "../utils";

// Re-export for consumers
export type { HealthFactorStatus };

/**
 * Result interface for useAaveUserPosition hook
 *
 * Note: In the Babylon vault integration, users can only have ONE position
 * because there's only one collateral reserve (vaultBTC). The position is
 * keyed by the user's depositor address.
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
  /**
   * True when position data may be stale (last successful fetch
   * exceeded the staleness threshold). Indicates oracle-derived
   * values (health factor, collateral/debt USD) may be outdated.
   * This is a UI-level warning — on-chain Aave has its own oracle
   * staleness protections for liquidation decisions.
   */
  isPositionDataStale: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function — returns fresh position data (or null if unavailable) */
  refetch: () => Promise<AavePositionWithLiveData | null>;
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
  const spokeAddress = config?.coreSpokeAddress;
  const vbtcReserveId = config?.btcVaultCoreVbtcReserveId;

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
    dataUpdatedAt,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: [
      "aaveUserPosition",
      connectedAddress,
      spokeAddress,
      vbtcReserveId?.toString(),
      borrowableReserveIdsKey,
    ],
    queryFn: () =>
      getUserPositionsWithLiveData(connectedAddress!, spokeAddress!, {
        borrowableReserveIds,
        vbtcReserveId: vbtcReserveId!,
      }),
    enabled: !!connectedAddress && !!spokeAddress && vbtcReserveId != null,
    refetchOnMount: true,
    refetchInterval: POSITION_REFETCH_INTERVAL_MS,
  });

  // Track staleness: re-evaluate when dataUpdatedAt changes or on a timer
  const [isPositionDataStale, setIsPositionDataStale] = useState(false);
  const stalenessTimerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    // No data fetched yet — not stale (just loading)
    if (dataUpdatedAt === 0) {
      setIsPositionDataStale(false);
      return;
    }

    const checkStaleness = () => {
      const age = Date.now() - dataUpdatedAt;
      setIsPositionDataStale(
        !isFetching && age > POSITION_STALENESS_THRESHOLD_MS,
      );
    };

    checkStaleness();

    // Re-check at the refetch interval so the flag updates even if
    // the component doesn't re-render from new data
    stalenessTimerRef.current = setInterval(
      checkStaleness,
      POSITION_REFETCH_INTERVAL_MS,
    );

    return () => {
      clearInterval(stalenessTimerRef.current);
    };
  }, [dataUpdatedAt, isFetching]);

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
        debtValueUsd: aaveRayValueToUsd(accountData.totalDebtValueRay),
        healthFactor:
          accountData.borrowCount > 0n
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
    isPositionDataStale,
    isLoading: positionsLoading || configLoading,
    error: positionsError as Error | null,
    refetch: async () => {
      const result = await refetch();
      if (result.isError) {
        throw result.error ?? new Error("Failed to refetch position data");
      }
      return result.data?.[0] ?? null;
    },
  };
}
