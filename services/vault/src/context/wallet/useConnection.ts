/**
 * useConnection hook
 *
 * Exposes the vault's authoritative wallet connection signals.
 *
 * ETH is the application session: every read and every Ethereum-only action is
 * available once its provider is connected and the connector dialog has been
 * confirmed. The confirmation check prevents a physical provider connection
 * from bypassing the wallet dialog's consent/ToS step when that dialog closes.
 * BTC is an optional signing capability requested only by peg-in/recovery
 * flows. `isConnected` intentionally remains the application-level signal so
 * existing pure-ETH consumers do not accidentally re-introduce a BTC gate.
 */

import {
  useBTCWallet,
  useETHWallet,
  useWalletConnect,
} from "@babylonlabs-io/wallet-connector";

export interface ConnectionState {
  /** Whether the confirmed application session has a live ETH wallet. */
  isConnected: boolean;
  /** Whether both wallets are connected and BTC-signing flows may start. */
  isFullyConnected: boolean;
  /** Whether BTC wallet is connected */
  btcConnected: boolean;
  /** Whether ETH wallet is connected */
  ethConnected: boolean;
}

/**
 * Hook to get combined wallet connection state
 * @returns Application, per-chain, and full connection state.
 */
export function useConnection(): ConnectionState {
  const { connected: btcConnected } = useBTCWallet();
  const { connected: ethConnected } = useETHWallet();
  const { connected: walletSessionConfirmed } = useWalletConnect();
  const isConnected = walletSessionConfirmed && ethConnected;

  return {
    isConnected,
    isFullyConnected: isConnected && btcConnected,
    btcConnected,
    ethConnected,
  };
}
