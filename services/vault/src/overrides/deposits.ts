import type { Hex } from "viem";

import type { VaultActivity } from "@/types/activity";
import type { DepositPollingResult } from "@/types/peginPolling";
import type { VaultProvider } from "@/types/vaultProvider";
import { getBatchSiblings } from "@/utils/batchedPegin";

import { createOverrideStore } from "./store";

export interface DepositOverride {
  pendingActivities: VaultActivity[];
  expiredActivities: VaultActivity[];
  resultsById: Map<string, DepositPollingResult>;
  provider: VaultProvider;
  hideReal: boolean;
}

const depositOverrideStore = createOverrideStore<DepositOverride>();

export const useDepositOverride = depositOverrideStore.useValue;
export const setDepositOverride = depositOverrideStore.set;

/**
 * Resolve a clicked demo deposit to the batch of owned vault ids the deposit
 * multistepper should open with, or `null` when the click must stay a no-op.
 *
 * Opens for any OWNED flow-state demo deposit (the 15 flow steps + the
 * activated terminal), so the whole Deposit Progress view can be walked with
 * god mode. Stays inert for a different-wallet (unowned) preview and for
 * expired deposits (those live in `expiredActivities`, not the pending list).
 *
 * There is no "would this auto-run real signing?" guard: for every demo id
 * PostDepositContinuationView renders a SAFE view (read-only progress, or the
 * simulated activation walk) — the real signing/registry branches never mount.
 */
export function getDemoStepperBatch(
  override: DepositOverride | null,
  depositId: string,
): Hex[] | null {
  if (!override) return null;
  const activity = override.pendingActivities.find((a) => a.id === depositId);
  if (!activity) return null;
  // Different-wallet demo cards are disabled previews — never open.
  if (!override.resultsById.get(depositId)?.isOwnedByCurrentWallet) return null;
  return getBatchSiblings(override.pendingActivities, activity)
    .filter((s) => override.resultsById.get(s.id)?.isOwnedByCurrentWallet)
    .map((s) => s.id as Hex);
}
