/**
 * Hook for fetching user's BTC balance
 *
 * Respects user's inscription preference from the wallet connect modal.
 * When ordinalsExcluded is true (default), shows only spendable balance.
 * When ordinalsExcluded is false, shows total balance including inscriptions.
 */

import { useBTCWallet } from "@babylonlabs-io/wallet-connector";
import { useMemo } from "react";

import { calculateBalance, useUTXOs } from "./useUTXOs";

/** Query key for BTC balance */
export const BTC_BALANCE_QUERY_KEY = "btcBalance";

/**
 * Result interface for useBTCBalance hook
 */
export interface UseBTCBalanceResult {
  /** Spendable BTC balance in satoshis (respects ordinalsExcluded preference) */
  balance: bigint;
  /** Spendable BTC balance formatted as BTC (8 decimals) */
  balanceFormatted: number;
  /** BTC balance locked in inscriptions (in satoshis) */
  inscriptionBalance: bigint;
  /** Loading state - true while fetching data */
  loading: boolean;
  /** Error state - contains error if fetch failed */
  error: Error | null;
  /** Function to manually refetch data */
  refetch: () => Promise<unknown>;
}

/**
 * Custom hook to fetch user's BTC balance
 *
 * Respects user's inscription preference:
 * - ordinalsExcluded=true (default): Returns spendable balance (excludes inscriptions)
 * - ordinalsExcluded=false: Returns total balance (includes inscriptions)
 *
 * @returns Object containing BTC balance, loading state, error state, and refetch function
 */
export function useBTCBalance(): UseBTCBalanceResult {
  const { address: btcAddress } = useBTCWallet();
  const {
    spendableUTXOs,
    inscriptionUTXOs,
    isLoading,
    isLoadingOrdinals,
    error,
    refetch,
  } = useUTXOs(btcAddress);

  // spendableUTXOs already respects the ordinalsExcluded preference
  const balance = useMemo(() => {
    if (!spendableUTXOs) return 0n;
    return BigInt(calculateBalance(spendableUTXOs));
  }, [spendableUTXOs]);

  const inscriptionBalance = useMemo(() => {
    if (!inscriptionUTXOs) return 0n;
    return BigInt(calculateBalance(inscriptionUTXOs));
  }, [inscriptionUTXOs]);

  // Format BTC balance for display
  const balanceFormatted = useMemo(() => {
    if (!balance) return 0;
    return Number(balance) / 1e8; // Convert satoshis to BTC
  }, [balance]);

  return {
    balance: balance || 0n,
    balanceFormatted,
    inscriptionBalance: inscriptionBalance || 0n,
    loading: isLoading || isLoadingOrdinals,
    error,
    refetch,
  };
}
