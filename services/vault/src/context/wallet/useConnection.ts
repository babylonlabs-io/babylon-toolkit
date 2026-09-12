import {
  useBTCWallet,
  useETHWallet,
  useWalletConnect,
} from "@babylonlabs-io/wallet-connector";

export interface ConnectionState {
  /** Whether both wallets have a confirmed session. */
  isConnected: boolean;
  /** Whether BTC wallet is connected */
  btcConnected: boolean;
  /** Whether ETH wallet is connected */
  ethConnected: boolean;
}

// Consent contract: docs/decisions/2354-wallet-consent.md.
export function useConnection(): ConnectionState {
  const { connected: confirmed } = useWalletConnect();
  const { connected: btcConnected } = useBTCWallet();
  const { connected: ethConnected } = useETHWallet();

  return {
    isConnected: confirmed && btcConnected && ethConnected,
    btcConnected,
    ethConnected,
  };
}
