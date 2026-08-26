/**
 * Batched-pegin grouping.
 *
 * A batched pegin funds multiple vaults from one shared Pre-PegIn Bitcoin
 * transaction. Vaults that share the same `unsignedPrePeginTx` therefore
 * belong to the same batch, and broadcasting that single transaction
 * commits all of them at once.
 */

import type { VaultActivity } from "@/types/activity";

/** Normalize a Pre-PegIn tx hex for batch-grouping comparison. */
function normalizePrePeginTx(hex: string): string {
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
  return stripped.toLowerCase();
}

/**
 * Group key for an activity. Activities with a non-empty Pre-PegIn tx are
 * keyed by it; an empty hex is the cross-device "no local tx" marker and
 * must never be treated as a shared batch key, so those stay standalone.
 */
function batchKey(activity: VaultActivity): string {
  const normalized = normalizePrePeginTx(activity.unsignedPrePeginTx);
  return normalized.length > 0 ? normalized : `standalone:${activity.id}`;
}

/**
 * Group deposit activities into batches. Activities sharing one Pre-PegIn
 * transaction land in the same group; a standalone deposit is a group of
 * one. Group order follows the first occurrence of each batch in the input.
 */
export function groupActivitiesByBatch(
  activities: VaultActivity[],
): VaultActivity[][] {
  const groups = new Map<string, VaultActivity[]>();
  for (const activity of activities) {
    const key = batchKey(activity);
    const existing = groups.get(key);
    if (existing) {
      existing.push(activity);
    } else {
      groups.set(key, [activity]);
    }
  }
  return [...groups.values()];
}

/**
 * Return every activity sharing `activity`'s Pre-PegIn transaction,
 * including `activity` itself. A standalone (or empty-hex) activity
 * resolves to a single-element list.
 */
export function getBatchSiblings(
  activities: VaultActivity[],
  activity: VaultActivity,
): VaultActivity[] {
  const key = batchKey(activity);
  if (key.startsWith("standalone:")) return [activity];
  return activities.filter((a) => batchKey(a) === key);
}
