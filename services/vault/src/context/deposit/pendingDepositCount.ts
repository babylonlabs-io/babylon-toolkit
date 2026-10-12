import { useSyncExternalStore } from "react";

import { ContractStatus } from "../../models/peginStateMachine";
import type { DepositOverride } from "../../overrides/deposits";
import type { VaultActivity } from "../../types/activity";

export function selectPendingActivities(
  activities: VaultActivity[],
  demo: DepositOverride | null,
): VaultActivity[] {
  const real = activities.filter(
    (a) =>
      a.contractStatus === ContractStatus.PENDING ||
      a.contractStatus === ContractStatus.VERIFIED,
  );
  if (!demo) return real;
  return [...demo.pendingActivities, ...(demo.hideReal ? [] : real)];
}

let pendingDepositSummary = { count: 0, progress: null as number | null };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return pendingDepositSummary;
}

export function publishPendingDepositSummary(
  count: number,
  progress: number | null,
): void {
  if (
    count === pendingDepositSummary.count &&
    progress === pendingDepositSummary.progress
  )
    return;
  pendingDepositSummary = { count, progress };
  for (const listener of listeners) listener();
}

export function usePendingDepositSummary() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
