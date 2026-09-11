import {
  useBTCWallet,
  useETHWallet,
  useWalletConnect,
} from "@babylonlabs-io/wallet-connector";

import featureFlags from "@/config/featureFlags";

export interface ConnectionState {
  /** Whether the required wallets have a confirmed session. */
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
    isConnected:
      confirmed &&
      ethConnected &&
      (featureFlags.isEthFirstEnabled || btcConnected),
    btcConnected,
    ethConnected,
  };
}
