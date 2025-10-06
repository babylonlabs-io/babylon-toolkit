/**
 * Fetching and managing pegin request data from smart contracts
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Address } from 'viem';
import { getPeginRequestsWithMorpho } from '../services/pegin/peginService';
import { transformPeginToActivity } from '../utils/peginTransformers';
import type { VaultActivity } from '../mockData/vaultActivities';
import { CONTRACTS, MORPHO_MARKET_ID } from '../config/contracts';

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
 * Custom hook to fetch pegin requests for a connected wallet address
 *
 * Combines React Query for data fetching with VaultActivity transformation for UI
 *
 * @param connectedAddress - Ethereum address of connected wallet (undefined if not connected)
 * @param onBorrowClick - Callback function when user clicks borrow action
 * @returns Object containing activities array, loading state, error state, and refetch function
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { address } = useETHWallet();
 *   const { activities, loading, error, refetch } = usePeginRequests(address, handleBorrow);
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <Error message={error.message} onRetry={refetch} />;
 *   return <ActivityList activities={activities} />;
 * }
 * ```
 */
export function usePeginRequests(
  connectedAddress: Address | undefined,
  onBorrowClick: (activity: VaultActivity) => void
): UsePeginRequestsResult {
  // Use React Query to fetch data from service layer
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['peginRequests', connectedAddress, CONTRACTS.BTC_VAULTS_MANAGER, CONTRACTS.VAULT_CONTROLLER, MORPHO_MARKET_ID],
    queryFn: () => getPeginRequestsWithMorpho(
      connectedAddress!,
      CONTRACTS.BTC_VAULTS_MANAGER,
      CONTRACTS.VAULT_CONTROLLER,
      MORPHO_MARKET_ID
    ),
    enabled: !!connectedAddress,
  });

  // Transform pegin requests to vault activities
  const activities = useMemo(() => {
    if (!data) return [];
    return data.map(({ peginRequest, txHash, morphoPosition, morphoMarket, btcPriceUSD }) =>
      transformPeginToActivity(peginRequest, txHash, onBorrowClick, morphoPosition, morphoMarket, btcPriceUSD)
    );
  }, [data, onBorrowClick]);

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
