/**
 * Price-health checks over Chainlink price metadata. Kept dependency-free (only
 * the erased `PriceMetadata` type) so they can be unit-tested without loading
 * the chainlink client.
 */

import type { PriceMetadata } from "@/clients/eth-contract/chainlink";

/**
 * True when any token's price is stale or its last fetch failed. Drives the
 * faster price-refetch cadence while unhealthy.
 */
export function hasUnhealthyPrice(
  metadata: Record<string, PriceMetadata> | undefined,
): boolean {
  if (!metadata) return false;
  return Object.values(metadata).some((m) => m.isStale || m.fetchFailed);
}

/**
 * The token's USD price when it is safe to show, otherwise null: before
 * prices have loaded, when the oracle round is stale (the client still returns
 * its last answer), when the fetch failed, or when the answer is not positive.
 * Only the requested token's own feed is judged.
 */
export function usablePriceUsd(
  prices: Record<string, number>,
  metadata: Record<string, PriceMetadata>,
  symbol: string,
): number | null {
  const feed: PriceMetadata | undefined = metadata[symbol];
  if (feed === undefined || feed.isStale || feed.fetchFailed) return null;
  const price: number | undefined = prices[symbol];
  return price !== undefined && price > 0 ? price : null;
}
