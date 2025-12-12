/**
 * Hook for fetching user's Aave position data
 *
 * Fetches the user's active Aave position with live on-chain data.
 * Returns raw position data - formatting should be done at the component level.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

import { useBTCPrice } from "@/hooks/useBTCPrice";
import { satoshiToBtcNumber } from "@/utils/btcConversion";

import { useAaveConfig } from "../context";
import {
  getUserPositionsWithLiveData,
  type AavePositionWithLiveData,
} from "../services";
import {
  calculateDebtValueUsd,
  calculateHealthFactor,
  liquidationThresholdFromBps,
  type HealthFactorResult,
} from "../utils";

/** Position refetch interval (30 seconds for live debt data) */
const POSITION_REFETCH_INTERVAL_MS = 30_000;

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
  /** Collateral amount in BTC */
  collateralBtc: number;
  /** Total collateral value in USD */
  collateralValueUsd: number;
  /** Total debt value in USD */
  debtValueUsd: number;
  /** Health factor calculation result (null if still loading config) */
  healthFactor: HealthFactorResult | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch user's Aave position with live data and health factor
 */
export function useAaveUserPosition(
  connectedAddress: Address | undefined,
): UseAaveUserPositionResult {
  const { config, vbtcReserve, isLoading: configLoading } = useAaveConfig();
  const { btcPriceUSD } = useBTCPrice();

  const spokeAddress = config?.btcVaultCoreSpokeAddress as Address | undefined;

  const {
    data: positions,
    isLoading: positionsLoading,
    error: positionsError,
    refetch,
  } = useQuery({
    queryKey: ["aaveUserPosition", connectedAddress, spokeAddress],
    queryFn: () =>
      getUserPositionsWithLiveData(connectedAddress!, spokeAddress!),
    enabled: !!connectedAddress && !!spokeAddress,
    refetchOnMount: true,
    refetchInterval: POSITION_REFETCH_INTERVAL_MS,
  });

  // User can only have one position (single vBTC collateral reserve)
  const position = positions?.[0] ?? null;

  // Derive values from position data
  const { collateralBtc, collateralValueUsd, debtValueUsd, healthFactor } =
    useMemo(() => {
      const btc = position ? satoshiToBtcNumber(position.totalCollateral) : 0;
      const collateralUsd = btc * btcPriceUSD;

      const debtUsd = position?.liveData.drawnShares
        ? calculateDebtValueUsd(
            position.liveData.drawnShares,
            position.liveData.premiumShares,
          )
        : 0;

      // Calculate health factor (null if config not yet loaded)
      const liquidationThreshold = vbtcReserve?.reserve.collateralRisk
        ? liquidationThresholdFromBps(vbtcReserve.reserve.collateralRisk)
        : null;

      const hf: HealthFactorResult | null =
        liquidationThreshold !== null
          ? calculateHealthFactor({
              collateralValueUsd: collateralUsd,
              debtValueUsd: debtUsd,
              liquidationThreshold,
            })
          : null;

      return {
        collateralBtc: btc,
        collateralValueUsd: collateralUsd,
        debtValueUsd: debtUsd,
        healthFactor: hf,
      };
    }, [position, btcPriceUSD, vbtcReserve?.reserve.collateralRisk]);

  return {
    position,
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    isLoading: positionsLoading || configLoading,
    error: positionsError as Error | null,
    refetch: async () => void refetch(),
  };
}
