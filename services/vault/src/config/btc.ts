/**
 * Extended Bitcoin Network Configuration
 *
 * Adapter between vault's plain network config (`@/config/network`) and
 * wallet-connector's `BTCConfig` shape, with extra UI display props.
 *
 * For signet network:
 * - Uses purple signet bitcoin icon
 * - Displays as "sBTC" / "Signet Bitcoin"
 * - USD display is disabled
 *
 * For mainnet:
 * - Uses standard orange bitcoin icon
 * - Displays as "BTC" / "Bitcoin"
 * - USD display is enabled
 */

import type { BTCConfig } from "@babylonlabs-io/wallet-connector";
import { Network } from "@babylonlabs-io/wallet-connector";

import {
  BTC_SIGNET,
  getNetworkConfigBTC as getBaseBTCConfig,
  getBTCNetwork as getBtcNetworkName,
  type BtcNetworkName,
} from "@/config/network";

/**
 * Extended BTC configuration type with UI display properties
 */
export type ExtendedBTCConfig = BTCConfig & {
  /** Path to the BTC icon asset */
  icon: string;
  /** Display name (e.g., "Bitcoin" or "Signet Bitcoin") */
  name: string;
  /** Whether to display USD values */
  displayUSD: boolean;
};

const NETWORK_BY_NAME: Record<BtcNetworkName, Network> = {
  mainnet: Network.MAINNET,
  signet: Network.SIGNET,
};

/**
 * Get extended BTC network configuration with UI display properties.
 * Adapts the local plain config into wallet-connector's `BTCConfig` shape.
 */
export function getNetworkConfigBTC(): ExtendedBTCConfig {
  const base = getBaseBTCConfig();
  const isSignet = base.network === BTC_SIGNET;

  return {
    coinName: base.coinName,
    coinSymbol: base.coinSymbol,
    networkName: base.networkName,
    mempoolApiUrl: base.mempoolApiUrl,
    network: NETWORK_BY_NAME[base.network],
    icon: isSignet ? "/images/signet_bitcoin.svg" : "/images/btc.png",
    name: isSignet ? "Signet Bitcoin" : "Bitcoin",
    displayUSD: !isSignet,
  };
}

/**
 * Get the BTC network as wallet-connector's `Network` enum value.
 * Adapter for downstream code that types against `Network`.
 */
export function getBTCNetwork(): Network {
  return NETWORK_BY_NAME[getBtcNetworkName()];
}
