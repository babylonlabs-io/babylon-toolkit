/**
 * useUTXOs React Hook
 *
 * Full React hook for fetching and managing Bitcoin UTXOs.
 * Includes inscription filtering based on user preference.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { IBTCProvider, UTXO } from "@/core/types";
import { filterInscriptionUtxos } from "@/utils/utxoFiltering";

import { useOrdinals } from "./useOrdinalsHook";

/**
 * Options for useUTXOs hook.
 */
export interface UseUTXOsOptions {
  /** Whether the query is enabled (default: true) */
  enabled?: boolean;
  /** Refetch interval for UTXOs in milliseconds */
  refetchInterval?: number;
  /** Base URL for ordinals API fallback */
  ordinalsApiUrl?: string;
  /** Whether to exclude inscription UTXOs from spendable balance (default: true) */
  ordinalsExcluded?: boolean;
}

/**
 * Raw UTXO from mempool API.
 */
export interface MempoolUTXO {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
}

/**
 * Result from useUTXOs hook.
 */
export interface UseUTXOsResult {
  /** All UTXOs (including unconfirmed) */
  allUTXOs: MempoolUTXO[];
  /** Only confirmed UTXOs (may include inscriptions) */
  confirmedUTXOs: MempoolUTXO[];
  /** Confirmed UTXOs without inscriptions (safe to spend) */
  availableUTXOs: UTXO[];
  /** Confirmed UTXOs that contain inscriptions */
  inscriptionUTXOs: UTXO[];
  /** Spendable UTXOs based on ordinalsExcluded preference */
  spendableUTXOs: UTXO[];
  /** Loading state (UTXOs) */
  isLoading: boolean;
  /** Loading state (ordinals detection) */
  isLoadingOrdinals: boolean;
  /** Error state (UTXOs) */
  error: Error | null;
  /** Error state (ordinals - non-blocking) */
  ordinalsError: Error | null;
  /** Refetch function */
  refetch: () => Promise<unknown>;
}

/**
 * Fetch UTXOs from mempool API.
 */
async function fetchUtxosFromMempool(
  address: string,
  mempoolApiUrl: string,
): Promise<MempoolUTXO[]> {
  const response = await fetch(`${mempoolApiUrl}/address/${address}/utxo`);
  if (!response.ok) {
    throw new Error(`Failed to fetch UTXOs: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Convert MempoolUTXO to wallet-connector UTXO type.
 */
function toWalletUtxo(utxo: MempoolUTXO): UTXO {
  return {
    txid: utxo.txid,
    vout: utxo.vout,
    value: utxo.value,
    scriptPubKey: "", // Not available from mempool API, but not needed for filtering
  };
}

/**
 * React hook to fetch UTXOs for a Bitcoin address.
 *
 * Fetches UTXOs from mempool API and filters out inscription UTXOs.
 * Returns spendableUTXOs based on ordinalsExcluded preference.
 *
 * @param btcAddress - Bitcoin address to fetch UTXOs for
 * @param mempoolApiUrl - URL for mempool API
 * @param btcProvider - BTC wallet provider (optional, for getInscriptions method)
 * @param options - Hook options
 * @returns Object containing UTXOs, loading state, error state, and refetch function
 */
export function useUTXOs(
  btcAddress: string | undefined,
  mempoolApiUrl: string,
  btcProvider: IBTCProvider | undefined | null,
  options: UseUTXOsOptions = {},
): UseUTXOsResult {
  const {
    enabled = true,
    refetchInterval,
    ordinalsApiUrl,
    ordinalsExcluded = true,
  } = options;

  // Fetch UTXOs from mempool API
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["btc-utxos", btcAddress],
    queryFn: () => fetchUtxosFromMempool(btcAddress!, mempoolApiUrl),
    enabled: !!btcAddress && enabled,
    refetchInterval,
    refetchOnMount: true,
    staleTime: 30_000, // 30 seconds
  });

  // Get confirmed UTXOs only
  const confirmedUTXOs = useMemo(() => {
    return data?.filter((utxo: MempoolUTXO) => utxo.status.confirmed) || [];
  }, [data]);

  // Convert to wallet-connector UTXO type for ordinals filtering
  const confirmedUtxosForOrdinals = useMemo(
    () => confirmedUTXOs.map(toWalletUtxo),
    [confirmedUTXOs],
  );

  // Fetch inscriptions for confirmed UTXOs
  const {
    inscriptions,
    isLoading: isLoadingOrdinals,
    error: ordinalsError,
  } = useOrdinals(confirmedUtxosForOrdinals, btcAddress, btcProvider, {
    enabled: !isLoading && confirmedUTXOs.length > 0,
    ordinalsApiUrl,
  });

  // Filter UTXOs by inscriptions
  const { availableUtxos, inscriptionUtxos } = useMemo(() => {
    if (
      isLoading ||
      isLoadingOrdinals ||
      confirmedUtxosForOrdinals.length === 0
    ) {
      return { availableUtxos: [], inscriptionUtxos: [] };
    }
    return filterInscriptionUtxos(confirmedUtxosForOrdinals, inscriptions);
  }, [confirmedUtxosForOrdinals, inscriptions, isLoading, isLoadingOrdinals]);

  // Determine spendable UTXOs based on preference
  const spendableUTXOs = useMemo(() => {
    if (isLoading || isLoadingOrdinals) {
      return [];
    }
    return ordinalsExcluded ? availableUtxos : confirmedUtxosForOrdinals;
  }, [ordinalsExcluded, availableUtxos, confirmedUtxosForOrdinals, isLoading, isLoadingOrdinals]);

  return {
    allUTXOs: data || [],
    confirmedUTXOs,
    availableUTXOs: availableUtxos,
    inscriptionUTXOs: inscriptionUtxos,
    spendableUTXOs,
    isLoading,
    isLoadingOrdinals,
    error: error as Error | null,
    ordinalsError,
    refetch,
  };
}

/**
 * Calculate total balance from UTXOs.
 *
 * Sums up the value of all provided UTXOs to get total balance in satoshis.
 *
 * @param utxos - Array of UTXOs
 * @returns Total balance in satoshis
 */
export function calculateBalance(utxos: Array<{ value: number }>): number {
  return utxos.reduce((total, utxo) => total + utxo.value, 0);
}
