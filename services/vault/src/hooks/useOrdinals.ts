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

import { BTC_MAINNET, getBTCNetwork } from "@/config/network";

/**
 * Get the ordinals API URL from environment variable.
 * This is optional - if not set, the hook will rely on wallet's getInscriptions().
 */
function getOrdinalsApiUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_TBV_ORDINALS_API_URL;
}

/**
 * Whether an inscription check can produce an answer on this network.
 *
 * Inscriptions are a mainnet concern. Every wallet the vault enables refuses to
 * enumerate them elsewhere — unisat/okx/onekey all throw
 * `INSCRIPTIONS_UNSUPPORTED_NETWORK` when the network isn't mainnet — and there
 * is no signet ordinals API to fall back to. Off mainnet the check therefore
 * can only ever fail, which would mean a permanent "couldn't verify" notice and
 * a Sentry breadcrumb every refetch, to protect assets that hold no value on a
 * test network. Skip it instead.
 *
 * This does not weaken the spendable set: the dust floor in `useUTXOs` applies
 * on every network, so the outputs inscriptions live on are excluded either way.
 */
function isInscriptionCheckSupported(): boolean {
  return getBTCNetwork() === BTC_MAINNET;
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
    enabled: (options?.enabled ?? true) && isInscriptionCheckSupported(),
    ordinalsApiUrl: getOrdinalsApiUrl(),
  });
}

// Re-export types from wallet-connector for convenience
export type {
  FilteredUtxos,
  InscriptionIdentifier,
  UTXO,
} from "@babylonlabs-io/wallet-connector";
