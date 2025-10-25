import { NetworkFees } from "../types/fee";

const MEMPOOL_API_URL =
  import.meta.env.VITE_MEMPOOL_API_URL || "https://mempool.space";

/**
 * Fetches Bitcoin network fee recommendations from mempool.space API.
 *
 * @returns Fee rates in sat/vbyte for different confirmation times
 * @throws Error if request fails or returns invalid data
 *
 * @see https://mempool.space/docs/api/rest#get-recommended-fees
 */
export async function getNetworkFees(): Promise<NetworkFees> {
  const response = await fetch(`${MEMPOOL_API_URL}/api/v1/fees/recommended`);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch network fees: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

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
