/**
 * useOrdinals React Hook
 *
 * Full React hook for fetching inscription/ordinal information for UTXOs.
 * Uses React Query for caching and the fetchOrdinals utility.
 */

import { useQuery } from "@tanstack/react-query";

import type { IBTCProvider, InscriptionIdentifier, UTXO } from "@/core/types";

import { fetchOrdinals, getOrdinalsQueryKey } from "./useOrdinals";

/** Default refetch interval for ordinals (5 minutes) */
const ORDINALS_REFETCH_INTERVAL = 5 * 60 * 1000;

/**
 * Options for useOrdinals hook.
 */
export interface UseOrdinalsOptions {
  /** Whether the query is enabled (default: true) */
  enabled?: boolean;
  /** Refetch interval in milliseconds (default: 5 minutes) */
  refetchInterval?: number;
  /** Base URL for ordinals API fallback */
  ordinalsApiUrl?: string;
}

/**
 * Result from useOrdinals hook.
 */
export interface UseOrdinalsResult {
  /** Inscription identifiers found in UTXOs */
  inscriptions: InscriptionIdentifier[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => Promise<unknown>;
}

/**
 * React hook to fetch inscription identifiers for UTXOs.
 *
 * Uses a two-step approach:
 * 1. Try wallet's getInscriptions() method (with timeout)
 * 2. Fall back to backend API verification if wallet method unavailable
 *
 * @param utxos - UTXOs to check for inscriptions
 * @param address - Bitcoin address owning the UTXOs
 * @param btcProvider - BTC wallet provider (optional, for getInscriptions method)
 * @param options - Hook options
 * @returns Object containing inscriptions, loading state, error state, and refetch function
 */
export function useOrdinals(
  utxos: UTXO[],
  address: string | undefined,
  btcProvider: IBTCProvider | undefined | null,
  options: UseOrdinalsOptions = {},
): UseOrdinalsResult {
  const {
    enabled = true,
    refetchInterval = ORDINALS_REFETCH_INTERVAL,
    ordinalsApiUrl,
  } = options;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: getOrdinalsQueryKey(address, utxos),
    queryFn: () =>
      fetchOrdinals({
        address: address!,
        utxos,
        btcProvider,
        ordinalsApiUrl,
        filterDustBeforeApi: true,
      }),
    enabled: !!address && utxos.length > 0 && enabled,
    refetchInterval,
    // Don't retry on failure - app should work without ordinals
    retry: false,
  });

  return {
    inscriptions: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
