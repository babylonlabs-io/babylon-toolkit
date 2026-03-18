/**
 * Hook to enrich items with logo URLs from the sidecar API.
 *
 * This is a generic hook that can be used to add logos to any entity
 * that has a unique identifier (e.g., vault providers, vault keepers).
 *
 * @example
 * ```typescript
 * const providersWithLogos = useWithLogos(
 *   providers,
 *   (p) => toIdentity(p.btcPubKey),
 * );
 * ```
 */

import { useMemo } from "react";

import { useLogos } from "./useLogos";

/**
 * Hook to enrich an array of items with logo URLs.
 *
 * @param items - Array of items to enrich with logos
 * @param getIdentity - Function to extract the identity from each item
 * @returns Array of items with `iconUrl` property added
 */
export function useWithLogos<T>(
  items: T[],
  getIdentity: (item: T) => string,
): (T & { iconUrl?: string })[] {
  // Compute identities and maintain mapping
  const itemsWithIdentities = useMemo(
    () =>
      items.map((item) => ({
        item,
        identity: getIdentity(item),
      })),
    [items, getIdentity],
  );

  const identities = useMemo(
    () => itemsWithIdentities.map(({ identity }) => identity),
    [itemsWithIdentities],
  );

  // Fetch logos (non-blocking, cached in localStorage)
  const { logos } = useLogos(identities);

  // Merge logos into items
  return useMemo(
    () =>
      itemsWithIdentities.map(({ item, identity }) => ({
        ...item,
        iconUrl: logos[identity],
      })),
    [itemsWithIdentities, logos],
  );
}
