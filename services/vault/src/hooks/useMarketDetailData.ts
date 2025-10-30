/**
 * Hook for fetching comprehensive market detail data
 * Combines market data, user position data, and wallet information
 */

import { useETHWallet } from "@babylonlabs-io/wallet-connector";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

// import { CONTRACTS } from "../config/contracts";
import type { MorphoMarketSummary } from "../clients/eth-contract";
import { Morpho } from "../clients/eth-contract";
import { VaultApiClient } from "../clients/vault-api";
import { getVaultApiUrl } from "../clients/vault-api/config";
import type { MorphoMarket } from "../clients/vault-api/types";

import { useBTCBalance } from "./useBTCBalance";
import { useUserPositions } from "./useUserPositions";

/**
 * Result interface for useMarketDetailData hook
 */
export interface UseMarketDetailDataResult {
  /** Market data from Morpho contracts */
  marketData: MorphoMarketSummary | null;
  /** Market configuration from API */
  marketConfig: MorphoMarket | null;
  /** User's position in this market (if any) */
  userPosition: {
    collateral: bigint;
    borrowAssets: bigint;
    borrowShares: bigint;
  } | null;
  /** User's BTC balance for max collateral */
  btcBalance: bigint;
  /** BTC price in USD from oracle */
  btcPriceUSD: number;
  /** Loading state - true while fetching data */
  loading: boolean;
  /** Error state - contains error if fetch failed */
  error: Error | null;
  /** Function to manually refetch data */
  refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch comprehensive market detail data
 *
 * @param marketId - Market ID to fetch data for
 * @returns Object containing market data, user position, BTC balance, price, and loading states
 */
export function useMarketDetailData(
  marketId: string | undefined,
): UseMarketDetailDataResult {
  const { address } = useETHWallet();
  const {
    btcBalance,
    loading: isBTCBalanceLoading,
    error: btcBalanceError,
  } = useBTCBalance();

  // Fetch all user positions
  const {
    positions: allPositions,
    loading: isPositionsLoading,
    error: positionsError,
    refetch: refetchPositions,
  } = useUserPositions(address as Address | undefined);

  // Find the position for this specific market
  const userPosition = useMemo(() => {
    if (!marketId || !allPositions) {
      return null;
    }

    const position = allPositions.find((p) => p.marketData.id === marketId);

    return position
      ? {
          collateral: position.morphoPosition.collateral,
          borrowAssets: position.morphoPosition.borrowAssets,
          borrowShares: position.morphoPosition.borrowShares,
        }
      : null;
  }, [allPositions, marketId]);

  // Initialize API client
  const apiClient = new VaultApiClient(getVaultApiUrl());

  // Fetch market data from Morpho contracts
  const {
    data: marketData,
    isLoading: isMarketLoading,
    error: marketError,
    refetch: refetchMarketData,
  } = useQuery<MorphoMarketSummary>({
    queryKey: ["marketData", marketId],
    queryFn: () => Morpho.getMarketWithData(marketId!),
    enabled: !!marketId,
    retry: 2,
    staleTime: 30000, // 30 seconds
  });

  // Fetch market configuration from API
  const {
    data: markets,
    isLoading: isMarketsLoading,
    error: marketsError,
    refetch: refetchMarkets,
  } = useQuery<MorphoMarket[]>({
    queryKey: ["markets"],
    queryFn: () => apiClient.getMarkets(),
    retry: 2,
    staleTime: 60000, // 1 minute
  });

  // Find the specific market configuration
  const marketConfig = useMemo(() => {
    if (!markets || !marketId) return null;
    return markets.find((market) => market.id === marketId) || null;
  }, [markets, marketId]);

  // Extract BTC price from market data
  // Note: btcPriceUSD is not directly available in MorphoMarketSummary
  // It needs to be fetched from the oracle. For now, we'll use a placeholder.
  const btcPriceUSD = 0; // TODO: Fetch BTC price from oracle

  // Combine loading states
  const loading =
    isMarketLoading ||
    isMarketsLoading ||
    isPositionsLoading ||
    isBTCBalanceLoading;

  // Combine errors
  const error =
    marketError || marketsError || positionsError || btcBalanceError;

  // Wrap refetch to return Promise<void>
  const wrappedRefetch = async () => {
    await Promise.all([
      refetchMarketData(),
      refetchMarkets(),
      refetchPositions(),
    ]);
  };

  return {
    marketData: marketData || null,
    marketConfig,
    userPosition,
    btcBalance,
    btcPriceUSD,
    loading,
    error: error as Error | null,
    refetch: wrappedRefetch,
  };
}
