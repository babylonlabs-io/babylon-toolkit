/**
 * Collateral ordering helpers for the post-reorder display override.
 *
 * The dashboard normally orders collateral by the indexer's `liquidationIndex`.
 * Right after a reorder, an in-memory override (the submitted order) takes over
 * so the new order shows immediately, until the indexer catches up. These pure
 * helpers apply that override and decide when it can be dropped.
 */

import type { Hex } from "viem";

import type { CollateralVaultEntry } from "@/types/collateral";

/** Entries ordered ascending by the indexer's liquidationIndex (default order). */
function byLiquidationIndex(
  entries: CollateralVaultEntry[],
): CollateralVaultEntry[] {
  return [...entries].sort((a, b) => a.liquidationIndex - b.liquidationIndex);
}

/** Whether `order` is exactly the set of vault IDs in `entries`. */
function orderMatchesEntrySet(
  entries: CollateralVaultEntry[],
  order: readonly Hex[],
): boolean {
  if (order.length !== entries.length) return false;
  const ids = new Set(entries.map((e) => e.vaultId.toLowerCase()));
  return (
    ids.size === order.length && order.every((id) => ids.has(id.toLowerCase()))
  );
}

/**
 * Sort entries by the post-reorder submitted order so the new order shows
 * immediately. Also rewrites each entry's `liquidationIndex` to its rank in the
 * override, so the per-row "Liquidation Order" ordinal matches the displayed
 * position (otherwise rows would show stale indexer ordinals during the
 * reconciliation window). Falls back to the indexer's liquidationIndex when
 * there is no override or it no longer describes the same vault set (e.g. a
 * vault was withdrawn since).
 */
export function sortByReorderedOverride(
  entries: CollateralVaultEntry[],
  order: readonly Hex[] | null,
): CollateralVaultEntry[] {
  if (!order || !orderMatchesEntrySet(entries, order)) {
    return byLiquidationIndex(entries);
  }
  const rank = new Map<string, number>();
  order.forEach((id, i) => rank.set(id.toLowerCase(), i));
  return entries
    .map((entry) => ({
      ...entry,
      liquidationIndex: rank.get(entry.vaultId.toLowerCase())!,
    }))
    .sort((a, b) => a.liquidationIndex - b.liquidationIndex);
}

/**
 * Whether the override should be dropped — true when there is no override, when
 * it no longer matches the vault set, or when the indexer's liquidationIndex
 * order already equals the override.
 */
export function isReorderOverrideReconciled(
  entries: CollateralVaultEntry[],
  order: readonly Hex[] | null,
): boolean {
  if (!order) return true;
  if (!orderMatchesEntrySet(entries, order)) return true;
  return byLiquidationIndex(entries).every(
    (e, i) => e.vaultId.toLowerCase() === order[i].toLowerCase(),
  );
}
