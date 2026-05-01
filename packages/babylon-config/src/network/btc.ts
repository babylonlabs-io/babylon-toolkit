/**
 * Bitcoin Network Configuration
 *
 * Reads from the runtime configured via {@link configureBabylonConfig}.
 * The library does NOT touch `process.env`; the host application is
 * responsible for plumbing env vars into `configureBabylonConfig` once
 * at startup.
 */

import type { BTCConfig } from "@babylonlabs-io/wallet-connector";
import { Network } from "@babylonlabs-io/wallet-connector";

import { getBabylonConfigState } from "../runtime";

import { BTC_MAINNET, BTC_SIGNET } from "./constants";

export { BTC_MAINNET, BTC_SIGNET } from "./constants";

// Re-exported for vault pegin usage
export type BTCNetwork = Network;

const STATIC_CONFIG: Record<
  typeof BTC_MAINNET | typeof BTC_SIGNET,
  Omit<BTCConfig, "mempoolApiUrl">
> = {
  [BTC_MAINNET]: {
    coinName: "BTC",
    coinSymbol: "BTC",
    networkName: "BTC",
    network: Network.MAINNET,
  },
  [BTC_SIGNET]: {
    coinName: "Signet BTC",
    coinSymbol: "sBTC",
    networkName: "BTC signet",
    network: Network.SIGNET,
  },
};

/**
 * Get BTC network configuration. Requires {@link configureBabylonConfig}
 * to have been called first.
 */
export function getNetworkConfigBTC(): BTCConfig {
  const { btcNetwork, mempoolApiUrl } = getBabylonConfigState();
  const base = STATIC_CONFIG[btcNetwork];
  return {
    ...base,
    mempoolApiUrl:
      btcNetwork === BTC_SIGNET ? `${mempoolApiUrl}/signet` : mempoolApiUrl,
  };
}

/**
 * Get the BTC network type for the current environment.
 */
export function getBTCNetwork(): BTCNetwork {
  return getNetworkConfigBTC().network;
}
