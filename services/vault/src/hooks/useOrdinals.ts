/**
 * Hook for fetching inscription/ordinal information for UTXOs.
 *
 * Thin wrapper around wallet-connector's useOrdinals hook.
 * Provides app-specific configuration (API URL from environment).
 */

import {
  useOrdinals as useBaseOrdinals,
  useChainConnector,
  type UTXO,
} from "@babylonlabs-io/wallet-connector";

/**
 * Get the ordinals API URL from environment variable.
 * Optional, but it is the only inscription check for a wallet that cannot list
 * inscriptions itself: one with no inscription index (Ledger Vault, Keystone),
 * or one whose getInscriptions() fails or times out. Without it, such a
 * wallet's UTXOs are treated as clean.
 */
function getOrdinalsApiUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_TBV_ORDINALS_API_URL;
}

/**
 * Hook to fetch inscription identifiers for UTXOs.
 *
 * @param utxos - UTXOs to check for inscriptions
 * @param options - Query options
 * @returns Query result with inscription identifiers
 */
export function useOrdinals(utxos: UTXO[], options?: { enabled?: boolean }) {
  const btcConnector = useChainConnector("BTC");
  const btcProvider = btcConnector?.connectedWallet?.provider;
  const address = btcConnector?.connectedWallet?.account?.address;

  return useBaseOrdinals(utxos, address, btcProvider, {
    enabled: options?.enabled,
    ordinalsApiUrl: getOrdinalsApiUrl(),
  });
}

// Re-export types from wallet-connector for convenience
export type {
  FilteredUtxos,
  InscriptionIdentifier,
  UTXO,
} from "@babylonlabs-io/wallet-connector";
