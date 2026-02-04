/**
 * useOrdinals Hook
 *
 * Hook for fetching inscription/ordinal information for UTXOs.
 * Uses a two-step approach:
 * 1. Try wallet's getInscriptions() method (with timeout)
 * 2. Fall back to backend API verification if wallet method unavailable
 *
 * This hook is designed to be used with React Query in the consuming application.
 */

import type { IBTCProvider, InscriptionIdentifier, UTXO } from "@/core/types";
import { toInscriptionIdentifiers, verifyUtxoOrdinals } from "@/api/ordinals";
import { filterDust } from "@/utils/utxoFiltering";

/** Default timeout for wallet getInscriptions() call (3 seconds) */
const WALLET_INSCRIPTIONS_TIMEOUT = 3000;

/** Query key for ordinals fetching */
export const ORDINALS_QUERY_KEY = "ordinals";

/**
 * Options for fetching ordinals.
 */
export interface FetchOrdinalsOptions {
  /** Bitcoin address owning the UTXOs */
  address: string;
  /** UTXOs to check for inscriptions */
  utxos: UTXO[];
  /** BTC wallet provider (for getInscriptions method) */
  btcProvider?: IBTCProvider | null;
  /** Base URL for ordinals API fallback (required if wallet doesn't support getInscriptions) */
  ordinalsApiUrl?: string;
  /** Timeout for wallet getInscriptions call in ms (default: 3000) */
  walletTimeout?: number;
  /** Whether to filter dust UTXOs before API verification (default: true) */
  filterDustBeforeApi?: boolean;
}

/**
 * Wait for a specified duration.
 */
function wait(ms: number): Promise<undefined> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch inscriptions using wallet provider or API fallback.
 *
 * This function is designed to be used as a queryFn in React Query.
 *
 * @param options - Options for fetching ordinals
 * @returns Array of inscription identifiers
 */
export async function fetchOrdinals(
  options: FetchOrdinalsOptions,
): Promise<InscriptionIdentifier[]> {
  const {
    address,
    utxos,
    btcProvider,
    ordinalsApiUrl,
    walletTimeout = WALLET_INSCRIPTIONS_TIMEOUT,
    filterDustBeforeApi = true,
  } = options;

  if (!address || utxos.length === 0) {
    return [];
  }

  // Step 1: Try wallet's getInscriptions() method with timeout
  if (btcProvider?.getInscriptions) {
    try {
      const inscriptions = await Promise.race([
        btcProvider.getInscriptions().catch(() => null),
        wait(walletTimeout),
      ]);

      if (inscriptions) {
        return inscriptions;
      }
    } catch {
      // Wallet method failed, fall through to API
    }
  }

  // Step 2: Fall back to backend API verification
  if (!ordinalsApiUrl) {
    // No API URL configured, return empty (app should work without ordinals)
    console.warn(
      "[useOrdinals] Wallet does not support getInscriptions and no ordinalsApiUrl configured",
    );
    return [];
  }

  try {
    // Optionally filter dust before API call to reduce payload
    const utxosToVerify = filterDustBeforeApi ? filterDust(utxos) : utxos;

    const verifiedUtxos = await verifyUtxoOrdinals(
      utxosToVerify,
      address,
      ordinalsApiUrl,
    );

    return toInscriptionIdentifiers(verifiedUtxos);
  } catch (error) {
    // API failed, return empty (app should work without ordinals)
    console.error("[useOrdinals] Failed to fetch ordinals from API:", error);
    return [];
  }
}

/**
 * Create query key for ordinals query.
 *
 * Use this to create consistent query keys across your application.
 *
 * @param address - Bitcoin address
 * @param utxos - UTXOs (used in key to refetch when UTXOs change)
 * @returns Query key array
 */
export function getOrdinalsQueryKey(
  address: string | undefined,
  utxos: UTXO[],
): readonly [string, string | undefined, UTXO[]] {
  return [ORDINALS_QUERY_KEY, address, utxos] as const;
}
