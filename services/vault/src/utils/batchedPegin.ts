/**
 * Batched-pegin grouping.
 *
 * A batched pegin funds multiple vaults from one shared Pre-PegIn Bitcoin
 * transaction. Vaults that share the same `unsignedPrePeginTx` therefore
 * belong to the same batch, and broadcasting that single transaction
 * commits all of them at once.
 */

import { ContractStatus } from "@babylonlabs-io/ts-sdk/tbv/core/services";

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

/** Stable construction ordering; unknown legacy entries retain input order. */
function orderBatch(activities: VaultActivity[]): VaultActivity[] {
  return activities
    .map((activity, inputIndex) => ({ activity, inputIndex }))
    .sort((a, b) => {
      const aIndex = a.activity.constructionIndex;
      const bIndex = b.activity.constructionIndex;
      if (aIndex === undefined && bIndex === undefined) {
        return a.inputIndex - b.inputIndex;
      }
      if (aIndex === undefined) return 1;
      if (bIndex === undefined) return -1;
      return aIndex - bIndex || a.inputIndex - b.inputIndex;
    })
    .map(({ activity }) => activity);
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
  return [...groups.values()].map(orderBatch);
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
  return orderBatch(activities.filter((a) => batchKey(a) === key));
}

/** Statuses from which a vault can still join the liquidation queue. */
const CAN_STILL_ACTIVATE: ReadonlySet<number> = new Set([
  ContractStatus.PENDING,
  ContractStatus.VERIFIED,
]);

/**
 * True while a lower construction-index sibling can still activate. A sibling
 * that is ACTIVE is already queued ahead, and a terminal one (redeemed,
 * expired, …) can never be queued, so neither blocks. UX only: the chain
 * guard in `assertActivationFollowsConstructionOrder` is authoritative.
 */
export function isActivationBlockedByEarlierSibling(
  activities: VaultActivity[],
  activity: VaultActivity,
): boolean {
  const index = activity.constructionIndex;
  if (index === undefined || index === 0) return false;
  return getBatchSiblings(activities, activity).some(
    (sibling) =>
      sibling.constructionIndex !== undefined &&
      sibling.constructionIndex < index &&
      CAN_STILL_ACTIVATE.has(sibling.contractStatus ?? ContractStatus.PENDING),
  );
}
