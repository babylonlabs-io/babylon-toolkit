/**
 * Fetching and managing pegin request data from smart contracts
 * Used in VaultDeposit tab to show deposit/collateral status only (no Morpho data)
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo, useEffect } from 'react';
import type { Address } from 'viem';
import { getPeginRequestsWithVaultMetadata } from '../services/pegin/peginService';
import { transformPeginToActivity } from '../utils/peginTransformers';
import type { VaultActivity } from '../mockData/vaultActivities';
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
  /** Optional callback for peg out action */
  onPegOut?: (activity: VaultActivity) => void;
}

/**
 * Custom hook to fetch pegin requests for a connected wallet address
 *
 * Fetches pegin/deposit data with vault metadata to show "in use" status.
 * Does NOT fetch full Morpho position details (for performance).
 * For full Morpho position data, use useVaultPositionsMorpho instead.
 *
 * @param params - Hook parameters
 * @returns Object containing activities array, loading state, error state, and refetch function
 *
 * @example
 * ```tsx
 * function DepositTab() {
 *   const { address } = useETHWallet();
 *   const { activities, loading, error, refetch } = usePeginRequests({
 *     connectedAddress: address,
 *     onPegOut: (activity) => console.log('Peg out', activity)
 *   });
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <Error message={error.message} onRetry={refetch} />;
 *   return <ActivityList activities={activities} />;
 * }
 * ```
 */
export function usePeginRequests({
  connectedAddress,
  onPegOut,
}: UsePeginRequestsParams): UsePeginRequestsResult {
  // Use React Query to fetch data from service layer
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'peginRequests',
      connectedAddress,
      CONTRACTS.BTC_VAULTS_MANAGER,
      CONTRACTS.VAULT_CONTROLLER,
    ],
    queryFn: () => {
      return getPeginRequestsWithVaultMetadata(
        connectedAddress!,
        CONTRACTS.BTC_VAULTS_MANAGER,
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

  // Transform pegin requests to vault activities
  const activities = useMemo(() => {
    if (!data) return [];

    const transformed = data.map(({ peginRequest, txHash, vaultMetadata }) =>
      transformPeginToActivity(peginRequest, txHash, vaultMetadata, onPegOut),
    );
    return transformed;
  }, [data, onPegOut]);

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
