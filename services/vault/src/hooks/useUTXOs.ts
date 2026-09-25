/**
 * Hook for fetching and managing Bitcoin UTXOs
 *
 * Fetches UTXOs from mempool API for the connected BTC wallet address — or,
 * for a wallet that can enumerate its own addresses, for every address it
 * may fund a deposit from, each UTXO annotated with the key that owns it.
 * Supports filtering out inscription UTXOs using the useOrdinals hook.
 * Returns spendableUTXOs based on user's inscription preference.
 */

import { getAddressUtxos, type MempoolUTXO } from "@babylonlabs-io/ts-sdk";
import { supportsMultiAddressFunding } from "@babylonlabs-io/ts-sdk/tbv/core";
import { collectFundingUtxos } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import {
  filterInscriptionUtxos,
  useChainConnector,
  type UTXO,
} from "@babylonlabs-io/wallet-connector";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { getBTCNetworkForWASM } from "@/config/pegin";
import { logger } from "@/infrastructure";

import { getMempoolApiUrl } from "../clients/btc/config";
import { useAppState } from "../state/AppState";

import { useOrdinals } from "./useOrdinals";

/** Query key for UTXO and address transactions fetching */
export const UTXOS_QUERY_KEY = "btc-utxos";
/** Query key for the wallet's own funding-address set (read once per connection). */
export const FUNDING_ADDRESSES_QUERY_KEY = "btc-funding-addresses";
/**
 * Third element of the UTXO query key when the listing covers the connected
 * address alone; a multi-address listing puts its address list there instead.
 */
export const SINGLE_ADDRESS_LISTING_KEY = "connected-address";

/**
 * A spendable UTXO as the deposit flow consumes it. `internalPubkeyHex` is
 * set when the wallet funds from more than one of its addresses; it must
 * travel unchanged to the broadcast and the stored record, because the
 * signing path signs each input under it.
 */
type SpendableUtxo = UTXO & { internalPubkeyHex?: string };

/**
 * Convert MempoolUTXO to the wallet-connector UTXO shape, keeping the owning
 * key when the listing carried one.
 */
function toWalletUtxo(
  utxo: MempoolUTXO & { internalPubkeyHex?: string },
): SpendableUtxo {
  return {
    txid: utxo.txid,
    vout: utxo.vout,
    value: utxo.value,
    scriptPubKey: utxo.scriptPubKey,
    internalPubkeyHex: utxo.internalPubkeyHex,
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
  const enabled = !!btcAddress && (options?.enabled ?? true);

  // Only a wallet that can enumerate its addresses (the Ledger vault wallet)
  // funds from more than the connected one.
  const provider = useChainConnector("BTC")?.connectedWallet?.provider;
  const fundingSource =
    provider !== undefined &&
    provider !== null &&
    supportsMultiAddressFunding(provider)
      ? provider
      : undefined;

  // Read once per connection (it takes the device lock), never on the UTXO
  // poll. A failed read gets the client's retry policy (`shouldRetry`, three
  // attempts), then stays failed until remount, navigation or a new address.
  const fundingAddressesQuery = useQuery({
    queryKey: [FUNDING_ADDRESSES_QUERY_KEY, btcAddress],
    queryFn: () => fundingSource!.getFundingAddresses(),
    enabled: enabled && fundingSource !== undefined,
    staleTime: Infinity,
  });
  const fundingAddresses =
    fundingSource === undefined ? undefined : fundingAddressesQuery.data;

  const utxoQuery = useQuery({
    // The address set is part of the key so `/1/0` data cannot go stale
    // across reconnects; the deposit flow invalidates by the two-element
    // prefix (after a broadcast, and on a pre-registration script mismatch),
    // which covers both shapes.
    queryKey: [
      UTXOS_QUERY_KEY,
      btcAddress,
      fundingAddresses === undefined
        ? SINGLE_ADDRESS_LISTING_KEY
        : fundingAddresses.map((funding) => funding.address),
    ],
    queryFn: async () => {
      // `refetch()` bypasses `enabled` (TanStack Query 5.90.20: `QueryObserver.
      // refetch` reaches `Query.fetch` with no `enabled` check): never list a
      // funding wallet by its connected address alone while its set is pending.
      if (fundingSource !== undefined && fundingAddresses === undefined) {
        throw new Error(
          "Cannot list UTXOs before the wallet's funding-address set is read",
        );
      }
      const apiUrl = getMempoolApiUrl();
      if (fundingAddresses === undefined) {
        return getAddressUtxos(btcAddress!, apiUrl);
      }
      // All or nothing across the address set: a partial read must not
      // masquerade as the wallet's balance.
      return collectFundingUtxos({
        addresses: fundingAddresses,
        network: getBTCNetworkForWASM(),
        listAddressUtxos: (address) => getAddressUtxos(address, apiUrl),
      });
    },
    // A funding wallet waits for its address set; nothing is listed from a
    // guess at what the set might be.
    enabled:
      enabled &&
      (fundingSource === undefined || fundingAddresses !== undefined),
    refetchInterval: options?.refetchInterval,
    refetchOnMount: true,
    staleTime: 30_000, // 30 seconds
  });
  const data = utxoQuery.data;
  const isLoading =
    utxoQuery.isLoading ||
    (fundingSource !== undefined && fundingAddressesQuery.isLoading);
  // A failed address read is the error: with no set there is no listing, and
  // an error from the device must not be hidden behind a pending listing.
  const error =
    fundingSource !== undefined && fundingAddressesQuery.error !== null
      ? fundingAddressesQuery.error
      : utxoQuery.error;

  // Get confirmed UTXOs only
  const confirmedUTXOs = useMemo(() => {
    return data?.filter((utxo) => utxo.confirmed) || [];
  }, [data]);

  // Sum of unconfirmed (in-mempool) UTXO values. Display-only: pending UTXOs
  // are never spendable and must not feed fee estimation, the spendable set,
  // or any signing path. Surfaced solely so the UI can explain why a freshly
  // funded address still reads a zero confirmed balance.
  const unconfirmedBalance = useMemo(() => {
    const unconfirmedUTXOs = data?.filter((utxo) => !utxo.confirmed) || [];
    return BigInt(calculateBalance(unconfirmedUTXOs));
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
      availableUTXOs: availableUtxos as SpendableUtxo[],
      inscriptionUTXOs: inscriptionUtxos as SpendableUtxo[],
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
    /** Total value of unconfirmed UTXOs in satoshis (display-only, never spendable) */
    unconfirmedBalance,
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
     * True when the ordinals check is still running AND the user has
     * inscription-exclusion enabled. The spendable set has not been filtered
     * yet, so consumers should block submission until it resolves.
     */
    ordinalsCheckPending,
    /** Refetch function (the listing; the address set is read once per connection) */
    refetch: utxoQuery.refetch,
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
