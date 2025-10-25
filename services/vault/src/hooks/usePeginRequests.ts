/**
 * Fetching and managing pegin request data from smart contracts
 * Used in VaultDeposit tab to show deposit/collateral status only (no Morpho data)
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo, useEffect } from 'react';
import type { Address } from 'viem';
import { getPeginRequestsWithDetails } from '../services/pegin/peginService';
import { transformPeginToActivity } from '../utils/peginTransformers';
import type { VaultActivity } from '../types';
import { CONTRACTS } from '../config/contracts';

/**
 * Result interface for usePeginRequests hook
 */
export interface UsePeginRequestsResult {
  /** Array of vault activities transformed from pegin requests */
  activities: VaultActivity[];
  /** Loading state - true while fetching data */
  loading: boolean;
  /** Error state - contains error if fetch failed */
  error: Error | null;
  /** Function to manually refetch data */
  refetch: () => Promise<void>;
}

/**
 * Parameters for usePeginRequests hook
 */
export interface UsePeginRequestsParams {
  /** Ethereum address of connected wallet (undefined if not connected) */
  connectedAddress: Address | undefined;
}

/**
 * Custom hook to fetch pegin requests for a connected wallet address
 *
 * Fetches pegin/deposit data. The "in use" status is determined from the pegin status itself (status 3 = InPosition).
 * Does NOT fetch full Morpho position details (for performance).
 * For full position data with Morpho details, use useUserPositions instead.
 *
 * @param params - Hook parameters
 * @returns Object containing activities array, loading state, error state, and refetch function
 */
export function usePeginRequests({
  connectedAddress,
}: UsePeginRequestsParams): UsePeginRequestsResult {
  // Use React Query to fetch data from service layer
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'peginRequests',
      connectedAddress,
      CONTRACTS.BTC_VAULTS_MANAGER,
    ],
    queryFn: () => {
      return getPeginRequestsWithDetails(
        connectedAddress!,
        CONTRACTS.BTC_VAULTS_MANAGER,
      );
    },
    enabled: !!connectedAddress,
    // Refetch when wallet connects to ensure fresh data
    refetchOnMount: true,
    // Poll every 30 seconds to track peg-in status updates
    refetchInterval: 30000,
  });

  // Trigger refetch when wallet connects (address changes from undefined to a value)
  useEffect(() => {
    if (connectedAddress) {
      refetch();
    }
  }, [connectedAddress, refetch]);

  // Transform pegin requests to vault activities
  const activities = useMemo(() => {
    if (!data) return [];

    const transformed = data.map(({ peginRequest, txHash }) =>
      transformPeginToActivity(peginRequest, txHash),
    );
    return transformed;
  }, [data]);

  // Wrap refetch to return Promise<void> for backward compatibility
  const wrappedRefetch = async () => {
    await refetch();
  };

  return {
    activities,
    loading: isLoading,
    error: error as Error | null,
    refetch: wrappedRefetch,
  };
}
