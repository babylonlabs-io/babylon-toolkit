/**
 * Hook for fetching and managing Bitcoin UTXOs
 *
 * Fetches UTXOs from mempool API for the connected BTC wallet address
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getUTXOs, type MempoolUTXO } from '../clients/btc/mempool';

/**
 * Hook to fetch UTXOs for a Bitcoin address
 *
 * @param btcAddress - Bitcoin address to fetch UTXOs for (undefined if not connected)
 * @param options - Additional options for the query
 * @returns Object containing UTXOs, loading state, error state, and refetch function
 */
export function useUTXOs(
  btcAddress: string | undefined,
  options?: { enabled?: boolean; refetchInterval?: number },
) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['btc-utxos', btcAddress],
    queryFn: () => getUTXOs(btcAddress!),
    enabled: !!btcAddress && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval,
    // Refetch when wallet connects to ensure fresh data
    refetchOnMount: true,
    // Keep data fresh but don't spam the API
    staleTime: 30_000, // 30 seconds
  });

  // Get confirmed UTXOs only
  const confirmedUTXOs = useMemo(() => {
    return data?.filter((utxo) => utxo.confirmed) || [];
  }, [data]);

  return {
    /** All UTXOs (including unconfirmed) */
    allUTXOs: data || [],
    /** Only confirmed UTXOs */
    confirmedUTXOs,
    /** Loading state */
    isLoading,
    /** Error state */
    error: error as Error | null,
    /** Refetch function */
    refetch,
  };
}

/**
 * Calculate total balance from UTXOs
 *
 * Sums up the value of all provided UTXOs to get total balance in satoshis.
 *
 * @param utxos - Array of UTXOs
 * @returns Total balance in satoshis
 */
export function calculateBalance(utxos: MempoolUTXO[]): number {
  // TODO: Filter out ordinals/inscriptions in production
  // For now, we sum all UTXO values without filtering inscriptions
  return utxos.reduce((total, utxo) => total + utxo.value, 0);
}
