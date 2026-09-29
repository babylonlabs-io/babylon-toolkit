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

let pendingDepositCount = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): number {
  return pendingDepositCount;
}

export function publishPendingDepositCount(count: number): void {
  if (count === pendingDepositCount) return;
  pendingDepositCount = count;
  for (const listener of listeners) listener();
}

export function usePendingDepositCount(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
