/**
 * Hook for fetching and managing Bitcoin UTXOs
 *
 * Fetches UTXOs from mempool API for the connected BTC wallet address.
 * Supports filtering out inscription UTXOs using the useOrdinals hook.
 * Returns spendableUTXOs based on user's inscription preference.
 */

import { getAddressUtxos, type MempoolUTXO } from "@babylonlabs-io/ts-sdk";
import {
  filterInscriptionUtxos,
  type UTXO,
} from "@babylonlabs-io/wallet-connector";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getMempoolApiUrl } from "../clients/btc/config";
import { useAppState } from "../state/AppState";

import { useOrdinals } from "./useOrdinals";

/** Query key for UTXO fetching */
export const UTXOS_QUERY_KEY = "btc-utxos";

/**
 * Convert MempoolUTXO to wallet-connector UTXO type.
 */
function toWalletUtxo(utxo: MempoolUTXO): UTXO {
  return {
    txid: utxo.txid,
    vout: utxo.vout,
    value: utxo.value,
    scriptPubKey: utxo.scriptPubKey,
  };
}

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
  const { ordinalsExcluded } = useAppState();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [UTXOS_QUERY_KEY, btcAddress],
    queryFn: () => getAddressUtxos(btcAddress!, getMempoolApiUrl()),
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
  } = useOrdinals(confirmedUtxosForOrdinals, {
    enabled: !isLoading && confirmedUTXOs.length > 0,
  });

  // Filter UTXOs by inscriptions
  // Rename to match exported API naming convention (uppercase UTXO)
  const { availableUTXOs, inscriptionUTXOs } = useMemo(() => {
    if (
      isLoading ||
      isLoadingOrdinals ||
      confirmedUtxosForOrdinals.length === 0
    ) {
      return { availableUTXOs: [], inscriptionUTXOs: [] };
    }
    const { availableUtxos, inscriptionUtxos } = filterInscriptionUtxos(
      confirmedUtxosForOrdinals,
      inscriptions,
    );
    return {
      availableUTXOs: availableUtxos,
      inscriptionUTXOs: inscriptionUtxos,
    };
  }, [confirmedUtxosForOrdinals, inscriptions, isLoading, isLoadingOrdinals]);

  // Determine spendable UTXOs based on preference
  // When ordinalsExcluded is true (default), use availableUTXOs (excludes inscriptions)
  // When ordinalsExcluded is false, use all confirmed UTXOs
  const spendableUTXOs = useMemo(() => {
    if (isLoading || isLoadingOrdinals) {
      return [];
    }
    return ordinalsExcluded ? availableUTXOs : confirmedUtxosForOrdinals;
  }, [
    ordinalsExcluded,
    availableUTXOs,
    confirmedUtxosForOrdinals,
    isLoading,
    isLoadingOrdinals,
  ]);

  // Create a set of inscription UTXO identifiers for filtering MempoolUTXOs
  const inscriptionUTXOIds = useMemo(() => {
    return new Set(inscriptionUTXOs.map((u) => `${u.txid}:${u.vout}`));
  }, [inscriptionUTXOs]);

  // Spendable UTXOs in MempoolUTXO format (for SDK functions)
  const spendableMempoolUTXOs = useMemo(() => {
    if (isLoading || isLoadingOrdinals) {
      return [];
    }
    if (!ordinalsExcluded) {
      return confirmedUTXOs;
    }
    // Filter out inscription UTXOs from the original MempoolUTXO array
    return confirmedUTXOs.filter(
      (utxo) => !inscriptionUTXOIds.has(`${utxo.txid}:${utxo.vout}`),
    );
  }, [
    ordinalsExcluded,
    confirmedUTXOs,
    inscriptionUTXOIds,
    isLoading,
    isLoadingOrdinals,
  ]);

  return {
    /** All UTXOs (including unconfirmed) */
    allUTXOs: data || [],
    /** Only confirmed UTXOs (may include inscriptions) */
    confirmedUTXOs,
    /** Confirmed UTXOs without inscriptions (safe to spend) */
    availableUTXOs,
    /** Confirmed UTXOs that contain inscriptions */
    inscriptionUTXOs,
    /** Spendable UTXOs based on ordinalsExcluded preference (UTXO type) */
    spendableUTXOs,
    /** Spendable UTXOs in MempoolUTXO format (for SDK functions) */
    spendableMempoolUTXOs,
    /** Loading state (UTXOs) */
    isLoading,
    /** Loading state (ordinals detection) */
    isLoadingOrdinals,
    /** Error state (UTXOs) */
    error: error as Error | null,
    /** Error state (ordinals - non-blocking) */
    ordinalsError,
    /** Refetch function */
    refetch,
  };
}

/**
 * Calculate total balance from UTXOs
 *
 * Sums up the value of all provided UTXOs to get total balance in satoshis.
 *
 * @param utxos - Array of UTXOs (MempoolUTXO or UTXO)
 * @returns Total balance in satoshis
 */
export function calculateBalance(utxos: Array<{ value: number }>): number {
  return utxos.reduce((total, utxo) => total + utxo.value, 0);
}
