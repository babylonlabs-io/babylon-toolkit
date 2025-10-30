/**
 * Hook for fetching user's BTC balance
 * This would integrate with the user's BTC wallet to get their actual balance
 */

import { useBTCWallet } from "@babylonlabs-io/wallet-connector";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { calculateBalance, useUTXOs } from "./useUTXOs";

/**
 * Result interface for useBTCBalance hook
 */
export interface UseBTCBalanceResult {
  /** BTC balance in satoshis */
  btcBalance: bigint;
  /** BTC balance formatted as BTC (8 decimals) */
  btcBalanceFormatted: number;
  /** Loading state - true while fetching data */
  loading: boolean;
  /** Error state - contains error if fetch failed */
  error: Error | null;
  /** Function to manually refetch data */
  refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch user's BTC balance
 *
 * Note: This is a placeholder implementation. In a real application,
 * this would integrate with the user's BTC wallet (e.g., via Bitcoin RPC)
 * to fetch their actual BTC balance.
 *
 * @returns Object containing BTC balance, loading state, error state, and refetch function
 */
export function useBTCBalance(): UseBTCBalanceResult {
  const { address: btcAddress } = useBTCWallet();
  const {
    confirmedUTXOs,
    isLoading: isUTXOsLoading,
    error: utxosError,
  } = useUTXOs(btcAddress);

  // Calculate real BTC balance from UTXOs
  const btcBalance = useMemo(() => {
    if (!confirmedUTXOs) return 0n;
    return BigInt(calculateBalance(confirmedUTXOs));
  }, [confirmedUTXOs]);

  // Use a simple query wrapper for consistency with other hooks
  const {
    isLoading: isQueryLoading,
    error: queryError,
    refetch,
  } = useQuery<bigint>({
    queryKey: ["btcBalance", btcAddress],
    queryFn: async () => btcBalance,
    enabled: !!btcAddress,
    retry: 2,
    staleTime: 60000, // 1 minute
  });

  // Format BTC balance for display
  const btcBalanceFormatted = useMemo(() => {
    if (!btcBalance) return 0;
    return Number(btcBalance) / 1e8; // Convert satoshis to BTC
  }, [btcBalance]);

  // Wrap refetch to return Promise<void>
  const wrappedRefetch = async () => {
    await refetch();
  };

  return {
    btcBalance: btcBalance || 0n,
    btcBalanceFormatted,
    loading: isUTXOsLoading || isQueryLoading,
    error: (utxosError || queryError) as Error | null,
    refetch: wrappedRefetch,
  };
}
