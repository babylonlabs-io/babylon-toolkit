/**
 * Hook for fetching user positions with Morpho data
 * Used in Positions tab to show borrowing positions
 *
 * Uses hybrid approach: fetches static data from GraphQL indexer,
 * then enriches with real-time borrow data from on-chain.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Address } from "viem";

import {
  getUserPositionsOptimized,
  type PositionWithMorphoOptimized,
} from "../services";

/**
 * Result interface for useUserPositions hook
 */
export interface UseUserPositionsResult {
  /** Array of positions with Morpho data */
  positions: PositionWithMorphoOptimized[];
  /** Loading state - true while fetching data */
  loading: boolean;
  /** Error state - contains error if fetch failed */
  error: Error | null;
  /** Function to manually refetch data */
  refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch user positions with Morpho data
 *
 * This hook uses a hybrid approach:
 * 1. Fetches active positions from GraphQL indexer (fast, includes market config)
 * 2. Enriches with real-time borrow data from Morpho contract (for interest accrual)
 * 3. Gets BTC price from oracle
 *
 * Each position can contain MULTIPLE vaults as collateral (N:1 relationship).
 *
 * @param connectedAddress - Ethereum address of connected wallet (undefined if not connected)
 * @returns Object containing positions array, loading state, error state, and refetch function
 */
export function useUserPositions(
  connectedAddress: Address | undefined,
): UseUserPositionsResult {
  // Use React Query to fetch data from optimized service
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["userPositions", connectedAddress],
    queryFn: () => getUserPositionsOptimized(connectedAddress!),
    enabled: !!connectedAddress,
    // Refetch when wallet connects to ensure fresh data
    refetchOnMount: true,
  });

  // Trigger refetch when wallet connects (address changes from undefined to a value)
  useEffect(() => {
    if (connectedAddress) {
      refetch();
    }
  }, [connectedAddress, refetch]);

  // Wrap refetch to return Promise<void> for backward compatibility
  const wrappedRefetch = async () => {
    await refetch();
  };

  return {
    positions: data ?? [],
    loading: isLoading,
    error: error as Error | null,
    refetch: wrappedRefetch,
  };
}
