import { NetworkFees } from "@/ui/common/types/fee";

/**
 * Mempool API configuration
 *
 * Gets mempool API URL from environment variable or uses default.
 * Environment variable: VITE_MEMPOOL_API_URL
 * Default: https://mempool.space
 */
const MEMPOOL_API_URL =
  import.meta.env.VITE_MEMPOOL_API_URL || "https://mempool.space";

/**
 * Fetches current Bitcoin network fee recommendations from mempool.space API
 *
 * This provides real-time fee rate estimates for different confirmation priorities.
 * The API returns fee rates in satoshis per vbyte (sat/vb).
 *
 * Endpoint: GET /api/v1/fees/recommended
 * Documentation: https://mempool.space/docs/api/rest#get-recommended-fees
 *
 * @returns Promise resolving to current network fee recommendations
 * @throws Error if API request fails or returns invalid data structure
 *
 * @example
 * ```typescript
 * const fees = await getNetworkFees();
 * console.log(`Next block fee: ${fees.fastestFee} sat/vb`);
 * console.log(`1 hour fee: ${fees.hourFee} sat/vb`);
 * ```
 */
export async function getNetworkFees(): Promise<NetworkFees> {
  const response = await fetch(`${MEMPOOL_API_URL}/api/v1/fees/recommended`);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch network fees: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  // Validate response has expected structure
  // Mempool API should return all five fee levels
  if (
    typeof data.fastestFee !== "number" ||
    typeof data.halfHourFee !== "number" ||
    typeof data.hourFee !== "number" ||
    typeof data.economyFee !== "number" ||
    typeof data.minimumFee !== "number"
  ) {
    throw new Error(
      "Invalid fee data structure from mempool API. Expected all fee fields to be numbers.",
    );
  }

  return data as NetworkFees;
}
