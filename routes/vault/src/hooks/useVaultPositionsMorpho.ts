/**
 * Hook for fetching user vault positions with Morpho data
 * Used in VaultPositions tab to show only active borrowing positions
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo, useEffect } from 'react';
import type { Address } from 'viem';
import { getUserVaultPositionsWithMorpho } from '../services/vault/vaultService';
import { CONTRACTS, MORPHO_MARKET_ID } from '../config/contracts';
import type { VaultPositionWithMorpho } from '../services/vault/vaultService';

/**
 * Result interface for useVaultPositionsMorpho hook
 */
export interface UseVaultPositionsMorphoResult {
  /** Array of vault positions with Morpho data */
  positions: VaultPositionWithMorpho[];
  /** Loading state - true while fetching data */
  loading: boolean;
  /** Error state - contains error if fetch failed */
  error: Error | null;
  /** Function to manually refetch data */
  refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch vault positions with Morpho data for a connected wallet
 *
 * This hook fetches only vaults that have active Morpho positions (borrowing).
 * Unlike usePeginRequests which fetches all peg-ins/collaterals,
 * this hook is specifically for the Positions tab.
 *
 * @param connectedAddress - Ethereum address of connected wallet (undefined if not connected)
 * @returns Object containing positions array, loading state, error state, and refetch function
 *
 * @example
 * ```tsx
 * function PositionsTab() {
 *   const { address } = useETHWallet();
 *   const { positions, loading, error, refetch } = useVaultPositionsMorpho(address);
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <Error message={error.message} onRetry={refetch} />;
 *   return <PositionList positions={positions} />;
 * }
 * ```
 */
export function useVaultPositionsMorpho(
  connectedAddress: Address | undefined,
): UseVaultPositionsMorphoResult {
  // Use React Query to fetch data from service layer
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'vaultPositionsMorpho',
      connectedAddress,
      CONTRACTS.VAULT_CONTROLLER,
      MORPHO_MARKET_ID,
    ],
    queryFn: () =>
      getUserVaultPositionsWithMorpho(
        connectedAddress!,
        CONTRACTS.VAULT_CONTROLLER,
        MORPHO_MARKET_ID,
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
