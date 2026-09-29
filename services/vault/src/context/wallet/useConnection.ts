import {
  useBTCWallet,
  useETHWallet,
  useWalletConnect,
} from "@babylonlabs-io/wallet-connector";

export interface ConnectionState {
  /** Whether the Ethereum wallet has a confirmed session. */
  isConnected: boolean;
  /** Whether BTC wallet is connected */
  btcConnected: boolean;
  /** Whether ETH wallet is connected */
  ethConnected: boolean;
}

export function useConnection(): ConnectionState {
  const { connected: confirmed } = useWalletConnect();
  const { connected: btcConnected } = useBTCWallet();
  const { connected: ethConnected } = useETHWallet();

  return {
    isConnected: confirmed && ethConnected,
    btcConnected,
    ethConnected,
  };
}
