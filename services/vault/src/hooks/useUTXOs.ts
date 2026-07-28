/**
 * Hook for fetching and managing Bitcoin UTXOs
 *
 * Fetches UTXOs from mempool API for the connected BTC wallet address.
 * Filters out inscription UTXOs using the useOrdinals hook, and caps the
 * spendable set to UTXOs the inscription classifier actually covers (see
 * `isAboveFloor`).
 */

import { getAddressUtxos, type MempoolUTXO } from "@babylonlabs-io/ts-sdk";
import {
  filterInscriptionUtxos,
  LOW_VALUE_UTXO_THRESHOLD,
  type UTXO,
} from "@babylonlabs-io/wallet-connector";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { useOrdinalsDebugOverride } from "@/dev/ordinalsDebugStore";
import { logger } from "@/infrastructure";

import { getMempoolApiUrl } from "../clients/btc/config";
import { useAppState } from "../state/AppState";

import { useOrdinals } from "./useOrdinals";

/** Query key for UTXO and address transactions fetching */
export const UTXOS_QUERY_KEY = "btc-utxos";

/**
 * Whether a UTXO is large enough to be used as a deposit input.
 *
 * The inscription classifier never examines outputs at or below
 * `LOW_VALUE_UTXO_THRESHOLD` on its API path (`filterDustBeforeApi` in
 * wallet-connector's `fetchOrdinals`), so anything below it has not been vetted
 * — and inscriptions are overwhelmingly held on ~546-sat outputs. Capping the
 * spendable set to the range the classifier covers means a deposit never spends
 * an output we could not check, including while the classifier is unavailable.
 * The same floor `simple-staking` applies to its spendable set.
 *
 * Display balances deliberately keep counting these UTXOs — they are the user's
 * funds, they just can't fund a deposit.
 *
 * `floorSats` is `LOW_VALUE_UTXO_THRESHOLD` everywhere except the god-mode
 * "Before fix" scenario, which lowers it to 0 to reproduce the old behaviour.
 */
function isAboveFloor(utxo: { value: number }, floorSats: number): boolean {
  return utxo.value > floorSats;
}

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

  // Dev/QA only: the god-mode panel forces the inscription-check scenarios by
  // substituting a synthetic UTXO set and classifier result. Null in production
  // (the flag is hard-gated on `import.meta.env.DEV`), so every value below
  // falls through to the live wallet and the live classifier.
  const debugOverride = useOrdinalsDebugOverride();
  const spendFloorSats =
    debugOverride?.spendFloorSats ?? LOW_VALUE_UTXO_THRESHOLD;

  // Get confirmed UTXOs only
  const confirmedUTXOs = useMemo(() => {
    if (debugOverride) return debugOverride.confirmedUTXOs;
    return data?.filter((utxo) => utxo.confirmed) || [];
  }, [data, debugOverride]);

  // Raw confirmed balance — sum of every confirmed UTXO, including inscription
  // UTXOs (which `availableUTXOs` / the spendable balance exclude). Display-only:
  // used solely to decide whether a zero spendable balance is genuinely due to
  // having no confirmed funds, rather than to confirmed funds being filtered out
  // as inscriptions. Must not feed fee estimation, the spendable set, or signing.
  const confirmedBalance = useMemo(() => {
    return BigInt(calculateBalance(confirmedUTXOs));
  }, [confirmedUTXOs]);

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
    inscriptions: liveInscriptions,
    isLoading: liveIsLoadingOrdinals,
    error: liveOrdinalsError,
  } = useOrdinals(confirmedUtxosForOrdinals, {
    enabled: !isLoading && confirmedUTXOs.length > 0,
  });

  const inscriptions = debugOverride?.inscriptions ?? liveInscriptions;
  const isLoadingOrdinals =
    debugOverride?.isLoadingOrdinals ?? liveIsLoadingOrdinals;
  const ordinalsError = debugOverride
    ? debugOverride.ordinalsError
    : liveOrdinalsError;

  // Log ordinals API errors once when the error changes (not on every render)
  useEffect(() => {
    if (ordinalsError) {
      logger.warn("Ordinals check failed; inscriptions cannot be excluded", {
        data: {
          error:
            ordinalsError instanceof Error
              ? ordinalsError.message
              : String(ordinalsError),
        },
      });
    }
  }, [ordinalsError]);

  // Split the confirmed set into known-safe and known-inscribed outputs.
  // While the check is loading or has failed we know neither, so both sets fall
  // back to "nothing identified as an inscription" — the dust floor applied to
  // the spendable sets below is what keeps that from putting an inscription in
  // a deposit, and `inscriptionCheckFailed` surfaces the residual to the user.
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

  // Determine spendable UTXOs based on preference, then apply the dust floor.
  // When ordinalsExcluded is true (default), start from availableUTXOs (excludes
  // known inscriptions); when false, the user opted into spending them, so start
  // from all confirmed UTXOs. Either way the floor caps the result to outputs
  // the classifier covers.
  const spendableUTXOs = useMemo(
    () =>
      (ordinalsExcluded ? availableUTXOs : confirmedUtxosForOrdinals).filter(
        (utxo) => isAboveFloor(utxo, spendFloorSats),
      ),
    [
      ordinalsExcluded,
      availableUTXOs,
      confirmedUtxosForOrdinals,
      spendFloorSats,
    ],
  );

  // Create a set of inscription UTXO identifiers for filtering MempoolUTXOs
  const inscriptionUTXOIds = useMemo(() => {
    return new Set(inscriptionUTXOs.map((u) => `${u.txid}:${u.vout}`));
  }, [inscriptionUTXOs]);

  // True when the ordinals check is still running and there is something to
  // check. Consumers disable submission until it resolves, so a deposit isn't
  // built from a set that is about to have inscriptions filtered out of it.
  // Deliberately independent of `ordinalsExcluded`: that preference is
  // persisted, client-tamperable UI state and must not decide whether a safety
  // check is honored. The window is a few seconds at most.
  const ordinalsCheckPending =
    isLoadingOrdinals && confirmedUtxosForOrdinals.length > 0;

  // True when the check errored and could not classify the wallet's UTXOs.
  // Display-only: it drives a notice telling the user we could not verify
  // inscriptions. Never gate spending on it — the dust floor is what protects
  // the deposit in this state.
  const inscriptionCheckFailed =
    ordinalsError != null && confirmedUtxosForOrdinals.length > 0;

  // Spendable UTXOs in MempoolUTXO format (for SDK functions). Must stay in
  // lockstep with `spendableUTXOs` above — this is the set that feeds fee
  // estimation, so a divergence would quote a fee for inputs we won't sign.
  const spendableMempoolUTXOs = useMemo(() => {
    if (!ordinalsExcluded) {
      return confirmedUTXOs.filter((utxo) =>
        isAboveFloor(utxo, spendFloorSats),
      );
    }
    // Filter out inscription UTXOs from the original MempoolUTXO array
    return confirmedUTXOs.filter(
      (utxo) =>
        !inscriptionUTXOIds.has(`${utxo.txid}:${utxo.vout}`) &&
        isAboveFloor(utxo, spendFloorSats),
    );
  }, [ordinalsExcluded, confirmedUTXOs, inscriptionUTXOIds, spendFloorSats]);

  return {
    /** All UTXOs (including unconfirmed) */
    allUTXOs: data || [],
    /** Only confirmed UTXOs (may include inscriptions) */
    confirmedUTXOs,
    /** Total value of confirmed UTXOs in satoshis, including inscription UTXOs (display-only) */
    confirmedBalance,
    /** Total value of unconfirmed UTXOs in satoshis (display-only, never spendable) */
    unconfirmedBalance,
    /** Confirmed UTXOs that contain inscriptions */
    inscriptionUTXOs,
    /**
     * UTXOs a deposit may spend (UTXO type): the inscription preference applied,
     * then capped to outputs above the dust floor the classifier covers.
     */
    spendableUTXOs,
    /** Same set in MempoolUTXO format (for SDK functions) */
    spendableMempoolUTXOs,
    /** Loading state */
    isLoading,
    /** Loading state (ordinals detection) */
    isLoadingOrdinals,
    /** Error state */
    error: error as Error | null,
    /** Error state (ordinals) */
    ordinalsError,
    /**
     * True while the inscription check is still running. The spendable set has
     * not been filtered yet, so consumers should block submission until it
     * resolves.
     */
    ordinalsCheckPending,
    /**
     * True when the inscription check errored. Display-only — drives a notice;
     * deposits are not blocked.
     */
    inscriptionCheckFailed,
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
