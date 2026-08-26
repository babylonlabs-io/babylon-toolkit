/**
 * useConnection hook
 *
 * Combines BTC and ETH wallet connection states into a single hook.
 * Components can use this instead of checking both wallets individually.
 */

import { useBTCWallet, useETHWallet } from "@babylonlabs-io/wallet-connector";

export interface ConnectionState {
  /** Whether both BTC and ETH wallets are connected */
  isConnected: boolean;
  /** Whether BTC wallet is connected */
  btcConnected: boolean;
  /** Whether ETH wallet is connected */
  ethConnected: boolean;
}

/**
 * Hook to get combined wallet connection state
 * @returns Connection state for both wallets
 */
export function useConnection(): ConnectionState {
  const { connected: btcConnected } = useBTCWallet();
  const { connected: ethConnected } = useETHWallet();

  return {
    isConnected: btcConnected && ethConnected,
    btcConnected,
    ethConnected,
  };
}
