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
   * `Date.now()` per deposit whose WOTS public key submission resolved,
   * anchoring the suppression TTL below. WOTS has no `OffChainTrackingStatus`
   * of its own — it is not a status the deposit rests in — so the completion is
   * recorded separately rather than by widening the status enum.
   */
  wotsSubmittedAt: ReadonlyMap<string, number>;
}

/**
 * How long a resolved WOTS submission keeps suppressing "Submit WOTS Key".
 *
 * The marker exists to bridge one gap: our submission has resolved but the VP
 * daemon has not advanced yet, so the poll still reports
 * `PENDING_DEPOSITOR_WOTS_PK`. That lag is seconds to minutes. Past this bound
 * the likelier reading of a VP still asking is that it genuinely wants a key —
 * rejected, rotated, or a write we lost behind a 200 — and an indefinite marker
 * would leave the row with no action at all and no route back short of a
 * reload. So the suppression lapses and the user can retry.
 *
 * Same reasoning as `REFUND_BROADCAST_SUPPRESSION_MS` in `peginStateMachine`,
 * which documents why a suppression marker must never be sticky. Generous
 * against real daemon lag, short enough that a stuck deposit recovers on its
 * own within one sitting.
 */
const WOTS_SUBMISSION_SUPPRESSION_MS = 10 * 60 * 1000;

const EMPTY_STATE: OptimisticDepositState = {
  statuses: new Map(),
  refundBroadcastAt: new Map(),
  wotsSubmittedAt: new Map(),
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
  // A repeat write carrying nothing new must not publish: every mounted
  // provider would re-render and re-memoize `getPollingResult` for a snapshot
  // that compares equal. Same discipline as `markWotsSubmitted` below. An
  // omitted `refundBroadcastAt` adds nothing by definition — the publish path
  // preserves the stored value rather than clearing it.
  if (
    currentState.statuses.get(depositId) === status &&
    (refundBroadcastAt === undefined ||
      currentState.refundBroadcastAt.get(depositId) === refundBroadcastAt)
  ) {
    return;
  }
  publish({
    statuses: new Map(currentState.statuses).set(depositId, status),
    refundBroadcastAt:
      refundBroadcastAt === undefined
        ? currentState.refundBroadcastAt
        : new Map(currentState.refundBroadcastAt).set(
            depositId,
            refundBroadcastAt,
          ),
    wotsSubmittedAt: currentState.wotsSubmittedAt,
  });
}

export function markWotsSubmitted(depositId: string): void {
  // First write wins: a repeat call must not slide the TTL forward, or a retry
  // loop could keep the action suppressed indefinitely.
  if (currentState.wotsSubmittedAt.has(depositId)) return;
  publish({
    statuses: currentState.statuses,
    refundBroadcastAt: currentState.refundBroadcastAt,
    wotsSubmittedAt: new Map(currentState.wotsSubmittedAt).set(
      depositId,
      Date.now(),
    ),
  });
}

/**
 * Whether a recorded submission is still recent enough to suppress the action.
 * A deposit with no recorded submission is never suppressed.
 *
 * Deliberately time-based rather than driven by an observed poll transition.
 * Retiring the marker when a poll stops reporting `needsWotsKey` looks tighter
 * but is not sound: absence is not an affirmative observation — a deposit whose
 * VP call errored, or that the provider has not polled, is absent too — and
 * because the store is app-scoped, the first of the two nested providers to
 * retire it would un-suppress the other's row while that one still holds a
 * pre-advance snapshot. A clock is read identically everywhere and cannot
 * disagree between providers.
 */
export function isWotsSubmissionWithinTtl(
  submittedAt: number | undefined,
): boolean {
  if (submittedAt === undefined) return false;
  return Date.now() - submittedAt < WOTS_SUBMISSION_SUPPRESSION_MS;
}

/**
 * Test-only reset: the store outlives any single provider, so cases asserting
 * suppression must start from a clean slate.
 */
export function resetOptimisticDepositState(): void {
  publish(EMPTY_STATE);
}
