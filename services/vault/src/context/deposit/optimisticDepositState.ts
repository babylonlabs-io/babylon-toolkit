/**
 * App-scoped store for "the user completed this step in this page session".
 *
 * Every mounted `PeginPollingProvider` reads the same snapshot. That scoping is
 * the whole point: the dashboard section mounts a provider over every activity,
 * while the continuation modal mounts its own provider scoped to the viewed
 * batch — nested inside that section. The hooks that drive an action
 * (`usePayoutSigningState`, `ResumeWotsContent`, …) run under the *modal's*
 * provider, so per-provider state meant the dashboard row that offered the
 * button never learned the action had succeeded and kept re-offering it. Same
 * reasoning, and same fix, as the tracking stores in `terminalMilestones.ts`
 * and `daemonTerminalEvents.ts`.
 *
 * This changes the SCOPE of the signal, not the trust model. It records only
 * outcomes this session watched resolve — it is never persisted, so a reload
 * drops it and the vault provider's polled status is ground truth again. The
 * anti-tamper reconciliation in `applyTrackingOverrides`, which distrusts a
 * localStorage status the VP contradicts, is deliberately left untouched.
 */

import type { LocalStorageStatus } from "../../models/peginStateMachine";

export interface OptimisticDepositState {
  /** Per-deposit status set the moment its action resolved. */
  statuses: ReadonlyMap<string, LocalStorageStatus>;
  /** Companion `Date.now()` for REFUND_BROADCAST, anchoring its suppression TTL. */
  refundBroadcastAt: ReadonlyMap<string, number>;
  /**
   * Deposits whose WOTS public key submission resolved. WOTS has no
   * `OffChainTrackingStatus` of its own — it is not a status the deposit rests
   * in — so the completion is recorded as its own set rather than by widening
   * the status enum.
   */
  wotsSubmitted: ReadonlySet<string>;
}

const EMPTY_STATE: OptimisticDepositState = {
  statuses: new Map(),
  refundBroadcastAt: new Map(),
  wotsSubmitted: new Set(),
};

let currentState: OptimisticDepositState = EMPTY_STATE;

const listeners = new Set<() => void>();

function publish(next: OptimisticDepositState): void {
  currentState = next;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeToOptimisticDepositState(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Stable-identity snapshot getter. `useSyncExternalStore` re-renders whenever
 * this returns a new reference, so every mutation below must replace the whole
 * object exactly once and unchanged reads must return the very same one.
 */
export function getOptimisticDepositState(): OptimisticDepositState {
  return currentState;
}

export function setOptimisticDepositStatus(
  depositId: string,
  status: LocalStorageStatus,
  refundBroadcastAt?: number,
): void {
  publish({
    statuses: new Map(currentState.statuses).set(depositId, status),
    refundBroadcastAt:
      refundBroadcastAt === undefined
        ? currentState.refundBroadcastAt
        : new Map(currentState.refundBroadcastAt).set(
            depositId,
            refundBroadcastAt,
          ),
    wotsSubmitted: currentState.wotsSubmitted,
  });
}

export function markWotsSubmitted(depositId: string): void {
  if (currentState.wotsSubmitted.has(depositId)) return;
  publish({
    statuses: currentState.statuses,
    refundBroadcastAt: currentState.refundBroadcastAt,
    wotsSubmitted: new Set(currentState.wotsSubmitted).add(depositId),
  });
}

/**
 * Test-only reset: the store outlives any single provider, so cases asserting
 * suppression must start from a clean slate.
 */
export function resetOptimisticDepositState(): void {
  publish(EMPTY_STATE);
}
