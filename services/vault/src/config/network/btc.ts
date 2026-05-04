/**
 * BTC network configuration.
 *
 * Reads from the runtime configured via `configureBabylonConfig`. Defines
 * its own plain shape — does NOT depend on wallet-connector types
 * (call sites adapt to wallet-connector's `BTCConfig` / `Network` enum
 * if needed).
 */

import { BTC_MAINNET, BTC_SIGNET } from "./constants";
import { getBabylonConfigState } from "./runtime";

export { BTC_MAINNET, BTC_SIGNET } from "./constants";

export type BtcNetworkName = typeof BTC_MAINNET | typeof BTC_SIGNET;

export interface BtcNetworkConfig {
  coinName: string;
  coinSymbol: string;
  networkName: string;
  mempoolApiUrl: string;
  network: BtcNetworkName;
}

const STATIC_CONFIG: Record<
  BtcNetworkName,
  Omit<BtcNetworkConfig, "mempoolApiUrl">
> = {
  [BTC_MAINNET]: {
    coinName: "BTC",
    coinSymbol: "BTC",
    networkName: "BTC",
    network: BTC_MAINNET,
  },
  [BTC_SIGNET]: {
    coinName: "Signet BTC",
    coinSymbol: "sBTC",
    networkName: "BTC signet",
    network: BTC_SIGNET,
  },
};

/**
 * Get BTC network configuration. Requires `configureBabylonConfig` to
 * have been called first.
 */
export function getNetworkConfigBTC(): BtcNetworkConfig {
  const { btcNetwork, mempoolApiUrl } = getBabylonConfigState();
  const base = STATIC_CONFIG[btcNetwork];
  return {
    ...base,
    mempoolApiUrl:
      btcNetwork === BTC_SIGNET ? `${mempoolApiUrl}/signet` : mempoolApiUrl,
  };
}

/**
 * Get the BTC network name (`"mainnet"` or `"signet"`).
 *
 * Returns a plain string union — wallet-connector's `Network` enum is
 * also string-valued (`Network.MAINNET === "mainnet"`,
 * `Network.SIGNET === "signet"`), so equality comparisons against the
 * enum continue to work without conversion.
 */
export function getBTCNetwork(): BtcNetworkName {
  return getNetworkConfigBTC().network;
}
