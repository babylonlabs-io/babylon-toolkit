/**
 * Extended Bitcoin Network Configuration
 *
 * Extends the base BTC config from @babylonlabs-io/config with additional
 * display properties (icon, name, displayUSD) for UI rendering.
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

import {
  getNetworkConfigBTC as getBaseBTCConfig,
  getBTCNetwork,
} from "@babylonlabs-io/config";
import type { BTCConfig } from "@babylonlabs-io/wallet-connector";
import { Network } from "@babylonlabs-io/wallet-connector";

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

/**
 * Get extended BTC network configuration with UI display properties
 *
 * @returns Extended BTC config based on current network
 */
export function getNetworkConfigBTC(): ExtendedBTCConfig {
  const baseConfig = getBaseBTCConfig();
  const network = getBTCNetwork();
  const isSignet = network === Network.SIGNET;

  return {
    ...baseConfig,
    icon: isSignet ? "/images/signet_bitcoin.svg" : "/images/btc.png",
    name: isSignet ? "Signet Bitcoin" : "Bitcoin",
    displayUSD: !isSignet,
  };
}

// Export the base getBTCNetwork for direct usage
export { getBTCNetwork };
