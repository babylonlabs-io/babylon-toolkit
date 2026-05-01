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
import { useEffect, useMemo } from "react";

import { logger } from "@/infrastructure";

import { getMempoolApiUrl } from "../clients/btc/config";
import { useAppState } from "../state/AppState";

import { useOrdinals } from "./useOrdinals";

/** Query key for UTXO and address transactions fetching */
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
    queryFn: async () => {
      const apiUrl = getMempoolApiUrl();
      return getAddressUtxos(btcAddress!, apiUrl);
    },
    enabled: !!btcAddress && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval,
    refetchOnMount: true,
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

  // Log ordinals API errors once when the error changes (not on every render)
  useEffect(() => {
    if (ordinalsError) {
      logger.warn("Ordinals API failed, treating all UTXOs as available", {
        data: {
          error:
            ordinalsError instanceof Error
              ? ordinalsError.message
              : String(ordinalsError),
        },
      });
    }
  }, [ordinalsError]);

  // Filter UTXOs by inscriptions
  // Rename to match exported API naming convention (uppercase UTXO)
  // If ordinals API fails or is still loading, treat all UTXOs as available (non-blocking)
  // UI should use isLoading/isLoadingOrdinals flags to show loading states
  const { availableUTXOs, inscriptionUTXOs } = useMemo(() => {
    if (confirmedUtxosForOrdinals.length === 0) {
      return { availableUTXOs: [], inscriptionUTXOs: [] };
    }
    // If ordinals API failed or still loading, treat all UTXOs as available
    // Ordinals check is optional - we don't block on it
    if (ordinalsError || isLoadingOrdinals) {
      return {
        availableUTXOs: confirmedUtxosForOrdinals,
        inscriptionUTXOs: [],
      };
    }
    const { availableUtxos, inscriptionUtxos } = filterInscriptionUtxos(
      confirmedUtxosForOrdinals,
      inscriptions,
    );
    return {
      availableUTXOs: availableUtxos,
      inscriptionUTXOs: inscriptionUtxos,
    };
  }, [
    confirmedUtxosForOrdinals,
    inscriptions,
    isLoadingOrdinals,
    ordinalsError,
  ]);

  // Determine spendable UTXOs based on preference
  // When ordinalsExcluded is true (default), use availableUTXOs (excludes inscriptions)
  // When ordinalsExcluded is false, use all confirmed UTXOs
  // If ordinals API failed/loading, availableUTXOs already contains all confirmed UTXOs
  const spendableUTXOs = useMemo(
    () => (ordinalsExcluded ? availableUTXOs : confirmedUtxosForOrdinals),
    [ordinalsExcluded, availableUTXOs, confirmedUtxosForOrdinals],
  );

  // Create a set of inscription UTXO identifiers for filtering MempoolUTXOs
  const inscriptionUTXOIds = useMemo(() => {
    return new Set(inscriptionUTXOs.map((u) => `${u.txid}:${u.vout}`));
  }, [inscriptionUTXOs]);

  // True when the ordinals check failed AND the user has inscription-exclusion
  // enabled. In that state, inscription UTXOs may be spent unintentionally,
  // so consumers should surface a warning to the user.
  const ordinalsCheckUnavailable =
    ordinalsExcluded && !isLoadingOrdinals && ordinalsError !== null;

  // True when the ordinals check is still running AND the user has
  // inscription-exclusion enabled. Consumers should block submission until
  // the check resolves, otherwise inscription UTXOs may be spent before the
  // filter can exclude them.
  const ordinalsCheckPending =
    ordinalsExcluded &&
    isLoadingOrdinals &&
    confirmedUtxosForOrdinals.length > 0;

  // Spendable UTXOs in MempoolUTXO format (for SDK functions)
  // If ordinals API failed/loading, inscriptionUTXOIds will be empty, so all UTXOs pass filter
  const spendableMempoolUTXOs = useMemo(() => {
    if (!ordinalsExcluded) {
      return confirmedUTXOs;
    }
    // Filter out inscription UTXOs from the original MempoolUTXO array
    return confirmedUTXOs.filter(
      (utxo) => !inscriptionUTXOIds.has(`${utxo.txid}:${utxo.vout}`),
    );
  }, [ordinalsExcluded, confirmedUTXOs, inscriptionUTXOIds]);

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
    /** Loading state */
    isLoading,
    /** Loading state (ordinals detection) */
    isLoadingOrdinals,
    /** Error state */
    error: error as Error | null,
    /** Error state (ordinals - non-blocking) */
    ordinalsError,
    /**
     * True when the ordinals check failed or timed out AND the user has
     * inscription-exclusion enabled - inscription UTXOs may be included in
     * the spendable set unintentionally.
     */
    ordinalsCheckUnavailable,
    /**
     * True when the ordinals check is still running AND the user has
     * inscription-exclusion enabled. The spendable set has not been filtered
     * yet, so consumers should block submission until it resolves.
     */
    ordinalsCheckPending,
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
