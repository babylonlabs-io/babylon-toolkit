/**
 * Hook to fetch available collaterals for borrowing
 *
 * Uses the pegin service to fetch and filter collaterals with status "Available" (status === 2).
 * These are pegins that have been verified by vault providers and are ready to be used as collateral,
 * but are NOT yet in a borrowing position.
 */

import { useQuery } from '@tanstack/react-query';
import type { Hex } from 'viem';
import { getAvailableCollaterals, type AvailableCollateral } from '../../../services/pegin/peginService';
import { CONTRACTS } from '../../../config/contracts';

export type { AvailableCollateral };

export interface UseAvailableCollateralsResult {
  /** Available collaterals that can be selected for borrowing */
  availableCollaterals: AvailableCollateral[];
  /** Whether data is loading */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
}

/**
 * Hook to get available collaterals for borrowing
 *
 * Fetches pegin requests (deposits) and filters for those that are:
 * - Verified and confirmed (status === 2)
 * - NOT yet in a borrowing position
 *
 * @param connectedAddress - User's Ethereum address
 * @returns Available collaterals with status "Available" (status === 2)
 */
export function useAvailableCollaterals(
  connectedAddress: Hex | undefined
): UseAvailableCollateralsResult {
  // Use React Query to fetch available collaterals from service layer
  const { data, isLoading, error } = useQuery({
    queryKey: [
      'availableCollaterals',
      connectedAddress,
      CONTRACTS.BTC_VAULTS_MANAGER,
      CONTRACTS.VAULT_CONTROLLER,
    ],
    queryFn: () => {
      return getAvailableCollaterals(
        connectedAddress!,
        CONTRACTS.BTC_VAULTS_MANAGER,
        CONTRACTS.VAULT_CONTROLLER,
      );
    },
    enabled: !!connectedAddress,
    refetchOnMount: true,
    // Poll every 30 seconds to track status updates
    refetchInterval: 30000,
  });

  return {
    availableCollaterals: data || [],
    isLoading,
    error: error as Error | null,
  };
}
