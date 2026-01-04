/**
 * Staking API Prices Client
 *
 * Fetches token prices in USD from the Babylon staking API.
 * The API returns prices for tokens in the Babylon ecosystem (e.g., BTC, BABY).
 *
 */

import { ENV, ENV_DEFAULTS } from "@/config/env";

interface PricesResponse {
  data: Record<string, number>;
}

/**
 * Get the staking API base URL from environment or default
 */
function getStakingApiUrl(): string {
  return ENV.STAKING_API_URL || ENV_DEFAULTS.STAKING_API_URL;
}

/**
 * Fetch current token prices from the Babylon staking API
 *
 * @returns Record mapping token symbols to their USD prices
 * @throws Error if the API request fails
 */
export async function getPrices(): Promise<Record<string, number>> {
  const baseUrl = getStakingApiUrl();
  const response = await fetch(`${baseUrl}/v2/prices`);

  if (!response.ok) {
    throw new Error(`Failed to fetch prices: ${response.statusText}`);
  }

  const data: PricesResponse = await response.json();
  return data.data;
}
