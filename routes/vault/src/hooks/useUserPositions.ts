/**
 * Hook for fetching user positions with Morpho data
 * Used in Positions tab to show borrowing positions
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo, useEffect } from 'react';
import type { Address } from 'viem';
import { getUserPositionsWithMorpho } from '../services/position';
import { CONTRACTS } from '../config/contracts';
import type { PositionWithMorpho } from '../services/position';

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
    queryKey: [
      'userPositions',
      connectedAddress,
      CONTRACTS.VAULT_CONTROLLER,
    ],
    queryFn: () =>
      getUserPositionsWithMorpho(
        connectedAddress!,
        CONTRACTS.VAULT_CONTROLLER
      ),
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

  // Filter positions to only include those with active borrowing (borrowShares > 0)
  const activePositions = useMemo(() => {
    if (!data) return [];

    return data.filter(
      (position) => position.morphoPosition.borrowShares > 0n
    );
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
