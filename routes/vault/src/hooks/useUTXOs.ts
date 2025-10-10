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
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { address } = useBTCWallet();
 *   const { allUTXOs, confirmedUTXOs, isLoading, error, refetch } = useUTXOs(address);
 *
 *   if (isLoading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *   return <UTXOList utxos={confirmedUTXOs} />;
 * }
 * ```
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
 *
 * @example
 * ```tsx
 * const { confirmedUTXOs } = useUTXOs(address);
 * const balanceSat = calculateBalance(confirmedUTXOs);
 * ```
 */
export function calculateBalance(utxos: MempoolUTXO[]): number {
  // TODO: Filter out ordinals/inscriptions in production
  // For now, we sum all UTXO values without filtering inscriptions
  return utxos.reduce((total, utxo) => total + utxo.value, 0);
}

/**
 * Select a suitable UTXO for a peg-in transaction
 *
 * Picks the smallest UTXO that covers the required amount + fee + dust.
 * This minimizes change output and conserves UTXOs.
 *
 * @param utxos - Array of confirmed UTXOs
 * @param requiredAmount - Amount needed in satoshis (peg-in amount + fee)
 * @param dustThreshold - Minimum change output to avoid dust (default: 1000 sats)
 * @returns Selected UTXO or undefined if no suitable UTXO found
 */
export function selectUTXOForPegin(
  utxos: MempoolUTXO[],
  requiredAmount: bigint,
  dustThreshold: bigint = 1000n,
): MempoolUTXO | undefined {
  // Convert required amount to number for comparison
  const required = Number(requiredAmount);

  // Filter UTXOs that can cover the required amount
  const suitableUTXOs = utxos.filter((utxo) => {
    const hasEnoughValue = utxo.value >= required;
    // Ensure change won't be dust (or there's no change needed)
    const changeAmount = utxo.value - required;
    const changeNotDust =
      changeAmount === 0 || changeAmount >= Number(dustThreshold);
    return hasEnoughValue && changeNotDust;
  });

  if (suitableUTXOs.length === 0) {
    return undefined;
  }

  // Sort by value ascending and pick the smallest one that works
  // This minimizes change and preserves larger UTXOs for future use
  const sorted = [...suitableUTXOs].sort((a, b) => a.value - b.value);
  return sorted[0];
}
