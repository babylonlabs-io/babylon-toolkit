/**
 * Ordering for the deposit screen's vault provider picker.
 *
 * Two tiers:
 * 1. Healthy, usable providers first — ranked by their most recent successful
 *    peg-in (newest first), so the providers people are actively and
 *    successfully depositing through surface at the top. Providers with no
 *    successful peg-in yet sort after those that have one.
 * 2. Problematic providers last — runtime-unhealthy (per `/vp-health`) or
 *    metadata-rejected (bad registered rpcUrl). Grouped at the bottom so a
 *    depositor sees the recommended options first.
 *
 * Within each tier, ties break alphabetically by name for a deterministic
 * order (the timestamp resolves to exact ms, never bucketed to hour/day).
 *
 * A vault provider link (`?vp=`) can then pin one healthy provider above both
 * tiers; see {@link pinVaultProvider}.
 */

import type { VaultProviderListItem } from "@/types/vaultProvider";

/**
 * A provider is "problematic" when it is runtime-unhealthy or its registered
 * rpcUrl was rejected. Used as both the sort discriminator (sinks the provider
 * to the bottom tier) and the picker's divider boundary (the first problematic
 * entry marks where the "currently unavailable" group begins) — keeping the
 * single definition guarantees those two views stay in sync.
 */
export function isProblematicVaultProvider(
  provider: VaultProviderListItem,
): boolean {
  return provider.unhealthy || provider.unavailable;
}

/**
 * The listed provider a vault provider link (`?vp=`) may pin and preselect:
 * the one whose id matches `providerId`, compared case-insensitively, and only
 * when it is not problematic. A link never puts an unreachable or rejected
 * provider first, nor chooses it for the depositor.
 */
export function findPinnableVaultProvider(
  providers: readonly VaultProviderListItem[],
  providerId: string | null,
): VaultProviderListItem | undefined {
  if (providerId === null) return undefined;
  const id = providerId.toLowerCase();
  const match = providers.find((p) => p.id.toLowerCase() === id);
  return match && !isProblematicVaultProvider(match) ? match : undefined;
}

/**
 * Returns a new array with the provider a vault provider link names moved to
 * the front, when {@link findPinnableVaultProvider} allows it. Otherwise the
 * order is unchanged. Does not mutate the input.
 */
export function pinVaultProvider(
  providers: readonly VaultProviderListItem[],
  providerId: string | null,
): VaultProviderListItem[] {
  const pinned = findPinnableVaultProvider(providers, providerId);
  if (pinned === undefined) return [...providers];
  return [pinned, ...providers.filter((p) => p !== pinned)];
}

/**
 * Returns a new array of providers ordered for the picker. Does not mutate
 * the input.
 */
export function sortVaultProviders(
  providers: readonly VaultProviderListItem[],
): VaultProviderListItem[] {
  return [...providers].sort((a, b) => {
    const aProblem = isProblematicVaultProvider(a);
    const bProblem = isProblematicVaultProvider(b);

    // Tier 1 vs tier 2: problematic providers always sink to the bottom.
    if (aProblem !== bProblem) {
      return aProblem ? 1 : -1;
    }

    // Within the healthy tier, rank by most recent successful peg-in.
    if (!aProblem) {
      const aAt = a.lastSuccessfulPeginAt;
      const bAt = b.lastSuccessfulPeginAt;
      if (aAt !== bAt) {
        if (aAt === undefined) return 1;
        if (bAt === undefined) return -1;
        return bAt - aAt;
      }
    }

    // Deterministic tiebreaker (and the only ordering within the bottom tier).
    return a.name.localeCompare(b.name);
  });
}
