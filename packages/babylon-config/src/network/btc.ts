/**
 * Bitcoin Network Configuration
 *
 * Provides network configuration for Bitcoin based on NEXT_PUBLIC_BTC_NETWORK.
 * Supports only mainnet and signet (used for development/testing).
 *
 * Required environment variable:
 * - NEXT_PUBLIC_BTC_NETWORK: Must be "mainnet" or "signet"
 *
 * Optional environment variable:
 * - NEXT_PUBLIC_MEMPOOL_API: Custom mempool API URL (default: "https://mempool.space")
 */

import type { BTCConfig } from "@babylonlabs-io/wallet-connector";
import { Network } from "@babylonlabs-io/wallet-connector";

const MEMPOOL_API =
  process.env.NEXT_PUBLIC_MEMPOOL_API || "https://mempool.space";

// Enforce required environment variable
const btcNetworkRaw = process.env.NEXT_PUBLIC_BTC_NETWORK;

if (!btcNetworkRaw) {
  throw new Error(
    "NEXT_PUBLIC_BTC_NETWORK environment variable is required. Must be set to 'mainnet' or 'signet'.",
  );
}

if (btcNetworkRaw !== "mainnet" && btcNetworkRaw !== "signet") {
  throw new Error(
    `Invalid NEXT_PUBLIC_BTC_NETWORK value: "${btcNetworkRaw}". Must be either 'mainnet' or 'signet'.`,
  );
}

// Type is now narrowed to "mainnet" | "signet" after validation
const btcNetwork = btcNetworkRaw as "mainnet" | "signet";

// Export for vault pegin usage
export type BTCNetwork = Network;

const config: Record<string, BTCConfig> = {
  mainnet: {
    coinName: "BTC",
    coinSymbol: "BTC",
    networkName: "BTC",
    mempoolApiUrl: MEMPOOL_API,
    network: Network.MAINNET,
  },
  signet: {
    coinName: "Signet BTC",
    coinSymbol: "sBTC",
    networkName: "BTC signet",
    mempoolApiUrl: `${MEMPOOL_API}/signet`,
    network: Network.SIGNET,
  },
};

/**
 * Get BTC network configuration based on NEXT_PUBLIC_BTC_NETWORK
 * @returns BTC network config (mainnet or signet)
 */
export function getNetworkConfigBTC(): BTCConfig {
  return config[btcNetwork];
}

/**
 * Get the BTC network type for the current environment
 * @returns BTC Network enum value (Network.MAINNET or Network.SIGNET)
 */
export function getBTCNetwork(): BTCNetwork {
  return getNetworkConfigBTC().network;
}
