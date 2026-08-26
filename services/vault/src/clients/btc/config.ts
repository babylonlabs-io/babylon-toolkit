/**
 * Configuration for Bitcoin/Mempool API client.
 *
 * Reads from the vault network config runtime (`@/config/network`) so the
 * mempool URL tracks the configured BTC network.
 */

import { getNetworkConfigBTC } from "@/config/network";

/**
 * Get the Mempool API base URL.
 *
 * Uses the correct network (mainnet/signet) based on the value passed to
 * `configureBabylonConfig` at startup (sourced from `NEXT_PUBLIC_BTC_NETWORK`).
 *
 * @returns Mempool API URL with `/api` suffix (e.g., https://mempool.space/signet/api)
 */
export function getMempoolApiUrl(): string {
  const btcConfig = getNetworkConfigBTC();
  return `${btcConfig.mempoolApiUrl}/api`;
}
