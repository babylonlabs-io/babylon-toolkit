/**
 * Price Warning Banner Component
 *
 * Displays warnings when price data is stale or unavailable.
 * Shows different messages based on the severity of the issue.
 */

import { Text } from "@babylonlabs-io/core-ui";

import type { PriceMetadata } from "@/clients/eth-contract/chainlink";

interface PriceWarningBannerProps {
  /** Metadata about price freshness and errors */
  metadata: Record<string, PriceMetadata>;
  /** Whether any price fetch failed */
  hasPriceFetchError: boolean;
  /** Whether any price data is stale */
  hasStalePrices: boolean;
}

/**
 * Get the age of the oldest stale price in hours
 */
function getMaxStaleAgeHours(metadata: Record<string, PriceMetadata>): number {
  const staleMetadata = Object.values(metadata).filter((meta) => meta.isStale);
  if (staleMetadata.length === 0) return 0;

  const maxAgeSeconds = Math.max(
    ...staleMetadata.map((meta) => meta.ageSeconds),
  );
  return maxAgeSeconds / 3600;
}

/**
 * Displays a warning banner when price data is stale or unavailable
 */
export function PriceWarningBanner({
  metadata,
  hasPriceFetchError,
  hasStalePrices,
}: PriceWarningBannerProps) {
  // Priority 1: Show error if price fetch completely failed
  if (hasPriceFetchError) {
    return (
      <div className="rounded-lg bg-error-main/10 p-4 text-error-main">
        <Text variant="body2" className="text-sm">
          Unable to fetch current price data. USD values may be unavailable or
          outdated. Please try refreshing the page.
        </Text>
      </div>
    );
  }

  // Priority 2: Show warning if price data is stale
  if (hasStalePrices) {
    const ageHours = getMaxStaleAgeHours(metadata);
    const isVeryStale = ageHours >= 24;

    return (
      <div
        className={`rounded-lg p-4 ${
          isVeryStale
            ? "bg-error-main/10 text-error-main"
            : "bg-warning-main/10 text-warning-main"
        }`}
      >
        <Text variant="body2" className="text-sm">
          {isVeryStale ? (
            <>
              Price data is significantly outdated ({ageHours.toFixed(0)} hours
              old). USD values are indicative only and may not reflect current
              market prices.
            </>
          ) : (
            <>
              Price data may be outdated ({ageHours.toFixed(1)} hours old). USD
              values are indicative only.
            </>
          )}
        </Text>
      </div>
    );
  }

  return null;
}
