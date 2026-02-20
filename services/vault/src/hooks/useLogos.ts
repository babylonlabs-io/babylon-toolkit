/**
 * Generic hook to fetch logos for any entities by their identities.
 *
 * This hook fetches logos from the sidecar API independently of other data.
 * It's designed to be non-blocking - if logos fail to load or take too long,
 * the UI can still function with fallback avatars.
 *
 * Caching Strategy:
 * - Logos are cached in localStorage per identity (not per request)
 * - Only fetches from API for identities NOT already in localStorage
 * - Cache TTL: 30 days (logos rarely change)
 * - If all requested identities are cached, no API call is made
 *
 * Usage:
 * - Pass an array of unique identifiers (e.g., BTC public keys without 0x prefix)
 * - The hook returns a map of identity -> logo URL
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { fetchLogos, type LogoResponse } from "@/clients/logo";

const STORAGE_KEY = "vault_logos_cache";

/** Cache TTL: 30 days in milliseconds */
const CACHE_TTL_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = CACHE_TTL_DAYS * MS_PER_DAY;

/** React Query garbage collection time: 1 day */
const QUERY_GC_TIME_MS = 1 * MS_PER_DAY;

interface CachedLogo {
  url: string;
  cachedAt: number;
}

interface LogoCache {
  [identity: string]: CachedLogo;
}

export interface UseLogosResult {
  /** Map of identity to logo URL */
  logos: LogoResponse;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
}

/**
 * Strips the "0x" prefix from a hex string if present.
 * Used to normalize BTC public keys to identity format for the logo API.
 */
export function toIdentity(hexString: string): string {
  return hexString.startsWith("0x") ? hexString.slice(2) : hexString;
}

/**
 * Get cached logos from localStorage
 */
function getLogoCache(): LogoCache {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

/**
 * Save logos to localStorage cache
 */
function saveToCache(logos: LogoResponse): void {
  try {
    const cache = getLogoCache();
    const now = Date.now();

    for (const [identity, url] of Object.entries(logos)) {
      cache[identity] = { url, cachedAt: now };
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore localStorage errors (quota exceeded, etc.)
  }
}

/**
 * Get cached logos for given identities, filtering out expired entries
 */
function getCachedLogos(identities: string[]): {
  cached: LogoResponse;
  missing: string[];
} {
  const cache = getLogoCache();
  const now = Date.now();
  const cached: LogoResponse = {};
  const missing: string[] = [];

  for (const identity of identities) {
    const entry = cache[identity];
    if (entry && now - entry.cachedAt < CACHE_TTL_MS) {
      cached[identity] = entry.url;
    } else {
      missing.push(identity);
    }
  }

  return { cached, missing };
}

/**
 * Fetch logos for missing identities and merge with cached
 */
async function fetchMissingLogos(identities: string[]): Promise<LogoResponse> {
  const { cached, missing } = getCachedLogos(identities);

  // If all identities are cached, return immediately without API call
  if (missing.length === 0) {
    return cached;
  }

  // Fetch only missing identities from API
  const fetched = await fetchLogos(missing);

  // Save newly fetched logos to localStorage
  if (Object.keys(fetched).length > 0) {
    saveToCache(fetched);
  }

  // Merge cached and fetched
  return { ...cached, ...fetched };
}

/**
 * Hook to fetch logos for a list of identities.
 *
 * @param identities - Array of unique identifiers (already normalized, without 0x prefix)
 * @returns Hook result with logos map, loading, and error states
 */
export function useLogos(identities: string[]): UseLogosResult {
  // Sort identities to ensure consistent cache key
  const sortedIdentities = useMemo(() => [...identities].sort(), [identities]);

  // Check how many are missing from localStorage (for cache key stability)
  const { missing } = useMemo(
    () => getCachedLogos(sortedIdentities),
    [sortedIdentities],
  );

  const { data, isLoading, error } = useQuery<LogoResponse>({
    // Include missing count in key so we refetch when new identities appear
    queryKey: ["logos", sortedIdentities, missing.length],
    queryFn: () => fetchMissingLogos(sortedIdentities),
    // Only fetch when there are identities
    enabled: sortedIdentities.length > 0,
    // Don't refetch automatically - we manage cache via localStorage
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    // Keep in React Query cache for session
    staleTime: Infinity,
    gcTime: QUERY_GC_TIME_MS,
    // Don't retry on failure - graceful degradation is fine
    retry: false,
  });

  return {
    logos: data ?? {},
    isLoading,
    error: error as Error | null,
  };
}
