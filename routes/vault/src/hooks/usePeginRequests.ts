/**
 * Fetching and managing pegin request data from smart contracts
 */

import { useState, useEffect, useCallback } from 'react';
import type { Address, Hex } from 'viem';
import { BTCVaultsManager } from '../clients/eth-contract';
import type { PeginRequest } from '../clients/eth-contract';
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
 * Custom hook to fetch pegin requests for a connected wallet address
 * 
 * Workflow:
 * 1. Calls getDepositorPeginRequests(address) to get array of transaction hashes
 * 2. For each hash, calls getPeginRequest(hash) to get detailed pegin data
 * 3. Transforms each PeginRequest to VaultActivity format for UI
 * 4. Returns activities array with loading and error states
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
  const [activities, setActivities] = useState<VaultActivity[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch pegin requests from contract and transform to activities
   */
  const fetchPeginRequests = useCallback(async () => {
    // Early return if no wallet connected
    if (!connectedAddress) {
      setActivities([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Step 1: Get all transaction hashes for this depositor
      const txHashes: Hex[] = await BTCVaultsManager.getDepositorPeginRequests(
        CONTRACTS.BTC_VAULTS_MANAGER,
        connectedAddress
      );

      // Early return if no vaults found
      if (txHashes.length === 0) {
        setActivities([]);
        setLoading(false);
        return;
      }

      // Step 2: Fetch detailed pegin request data for each transaction hash
      // Use Promise.all for parallel fetching to improve performance
      const peginRequests: Array<{ peginRequest: PeginRequest; txHash: Hex }> = await Promise.all(
        txHashes.map(async (txHash) => {
          const peginRequest = await BTCVaultsManager.getPeginRequest(
            CONTRACTS.BTC_VAULTS_MANAGER,
            txHash
          );
          return { peginRequest, txHash };
        })
      );

      // Step 3: Transform pegin requests to vault activities
      const transformedActivities = peginRequests.map(({ peginRequest, txHash }) =>
        transformPeginToActivity(peginRequest, txHash, onBorrowClick)
      );

      setActivities(transformedActivities);
      setLoading(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err : new Error('Failed to fetch pegin requests');
      setError(errorMessage);
      setActivities([]);
      setLoading(false);
    }
  }, [connectedAddress, onBorrowClick]);

  /**
   * Manual refetch function exposed to component
   */
  const refetch = useCallback(async () => {
    await fetchPeginRequests();
  }, [fetchPeginRequests]);

  /**
   * Auto-fetch on wallet connection or address change
   */
  useEffect(() => {
    fetchPeginRequests();
  }, [fetchPeginRequests]);

  return {
    activities,
    loading,
    error,
    refetch,
  };
}
