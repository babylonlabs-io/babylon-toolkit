import type { BTCConfig } from "@babylonlabs-io/wallet-connector";
import { Network } from "@babylonlabs-io/wallet-connector";

const MEMPOOL_API = process.env.NEXT_PUBLIC_MEMPOOL_API || "https://mempool.space";
const defaultNetwork = "devnet";
const network = process.env.NEXT_PUBLIC_NETWORK ?? defaultNetwork;

// Export for vault pegin usage
export type BTCNetwork = Network;

const config: Record<string, BTCConfig> = {
  mainnet: {
    coinName: "BTC",
    coinSymbol: "BTC",
    networkName: "BTC",
    mempoolApiUrl: `${MEMPOOL_API}`,
    network: Network.MAINNET,
  },
  canary: {
    coinName: "BTC",
    coinSymbol: "BTC",
    networkName: "BTC",
    mempoolApiUrl: `${MEMPOOL_API}`,
    network: Network.MAINNET,
  },
  devnet: {
    coinName: "Signet BTC",
    coinSymbol: "sBTC",
    networkName: "BTC signet",
    mempoolApiUrl: `${MEMPOOL_API}/signet`,
    network: Network.SIGNET,
  },
  testnet: {
    coinName: "Signet BTC",
    coinSymbol: "sBTC",
    networkName: "BTC signet",
    mempoolApiUrl: `${MEMPOOL_API}/signet`,
    network: Network.SIGNET,
  },
};

export function getNetworkConfigBTC(): BTCConfig {
  return config[network] ?? config[defaultNetwork];
}

/**
 * Get the BTC network type for the current environment
 * @returns BTC Network enum value
 */
export function getBTCNetwork(): BTCNetwork {
  return getNetworkConfigBTC().network;
}
