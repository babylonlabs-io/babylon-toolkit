/**
 * Configuration for Bitcoin/Mempool API client
 *
 * Uses babylon-config for network-aware mempool API URLs
 */

import { getNetworkConfigBTC } from "@babylonlabs-io/config";

/**
 * Get the Mempool API base URL from babylon-config
 *
 * This automatically uses the correct network (mainnet/signet) based on
 * NEXT_PUBLIC_BTC_NETWORK environment variable.
 *
 * @returns Mempool API URL with `/api` suffix (e.g., https://mempool.space/signet/api)
 */
export function getMempoolApiUrl(): string {
  const btcConfig = getNetworkConfigBTC();
  return `${btcConfig.mempoolApiUrl}/api`;
}

/**
 * Default timeout for Mempool API requests (30 seconds)
 */
export const MEMPOOL_API_TIMEOUT = 30000;
