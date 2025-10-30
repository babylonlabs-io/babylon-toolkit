/**
 * Hook for fetching user positions with Morpho data
 * Used in Positions tab to show borrowing positions
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { Address } from "viem";

import { CONTRACTS } from "../config/contracts";
import type { PositionWithMorpho } from "../services/position";
import { getUserPositionsWithMorpho } from "../services/position";

/**
 * Result interface for useUserPositions hook
 */
export interface UseUserPositionsResult {
  /** Array of positions with Morpho data */
  positions: PositionWithMorpho[];
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
 * This hook fetches all positions for a user (borrowing positions in Morpho markets).
 * Each position can contain MULTIPLE vaults as collateral (N:1 relationship).
 *
 * @param connectedAddress - Ethereum address of connected wallet (undefined if not connected)
 * @returns Object containing positions array, loading state, error state, and refetch function
 */
export function useUserPositions(
  connectedAddress: Address | undefined,
): UseUserPositionsResult {
  // Use React Query to fetch data from service layer
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["userPositions", connectedAddress, CONTRACTS.VAULT_CONTROLLER],
    queryFn: () => {
      return getUserPositionsWithMorpho(
        connectedAddress!,
        CONTRACTS.VAULT_CONTROLLER,
      );
    },
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

  // Filter positions to include:
  // 1. Active borrowing (borrowShares > 0) - can repay/borrow more
  // 2. Collateral only (borrowShares = 0, collateral > 0) - can withdraw
  const activePositions = useMemo(() => {
    if (!data) {
      return [];
    }

    const filtered = data.filter(
      (position) =>
        position.morphoPosition.borrowShares > 0n ||
        position.morphoPosition.collateral > 0n,
    );

    return filtered;
  }, [data]);

  // Wrap refetch to return Promise<void> for backward compatibility
  const wrappedRefetch = async () => {
    await refetch();
  };

  return {
    positions: activePositions,
    loading: isLoading,
    error: error as Error | null,
    refetch: wrappedRefetch,
  };
}
