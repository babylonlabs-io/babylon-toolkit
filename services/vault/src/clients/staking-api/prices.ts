/**
 * Staking API Prices Client
 *
 * Fetches token prices in USD from the Babylon staking API.
 * The API returns prices for tokens in the Babylon ecosystem (e.g., BTC, BABY).
 *
 */

import { ENV, ENV_DEFAULTS } from "@/config/env";

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
  const url = `${baseUrl}/v2/prices`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Network error while fetching staking prices from ${url}: ${message}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch prices from ${url}: HTTP ${response.status} ${response.statusText}`,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse staking prices response from ${url} as JSON: ${message}`,
    );
  }

  if (json === null || typeof json !== "object") {
    throw new Error("Failed to fetch prices: invalid response format");
  }

  const maybeData = (json as { data?: unknown }).data;
  if (maybeData === null || typeof maybeData !== "object") {
    throw new Error("Failed to fetch prices: missing or invalid 'data' field");
  }

  const prices: Record<string, number> = {};
  for (const [key, value] of Object.entries(
    maybeData as Record<string, unknown>,
  )) {
    if (typeof value !== "number") {
      throw new Error(
        `Failed to fetch prices: price for '${key}' is not a number`,
      );
    }
    prices[key] = value;
  }

  return prices;
}
