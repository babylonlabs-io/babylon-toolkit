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
