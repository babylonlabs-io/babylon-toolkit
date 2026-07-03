import type { PriceMetadata } from "@/clients/eth-contract/chainlink";

/**
 * True when any token's price is stale or its last fetch failed. Drives the
 * faster price-refetch cadence while unhealthy. Kept dependency-free (only the
 * erased `PriceMetadata` type) so it can be unit-tested without loading the
 * chainlink client.
 */
export function hasUnhealthyPrice(
  metadata: Record<string, PriceMetadata> | undefined,
): boolean {
  if (!metadata) return false;
  return Object.values(metadata).some((m) => m.isStale || m.fetchFailed);
}
