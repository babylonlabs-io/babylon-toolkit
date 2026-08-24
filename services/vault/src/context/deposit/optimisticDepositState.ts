/**
 * App-scoped store for "the user completed this step in this page session".
 *
 * Module-scoped rather than provider state for two reasons. The writers run
 * outside the context surface — `markWotsSubmitted` is called directly from
 * `useDepositFlow` and `ResumeDepositContent`, neither of which holds the
 * context. And the single `AppPeginPollingProvider` still unmounts: RootLayout
 * swaps its whole content subtree for the geo-block branch, and wallet churn
 * remounts it, either of which would wipe provider-local state mid-flow. Same
 * reasoning as the tracking stores in `terminalMilestones.ts` and
 * `daemonTerminalEvents.ts`.
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
  /**
   * Deposits whose payout-signing ceremony the user cancelled this session
   * (settled device cancel in the deposit flow). `ResumeSignContent` reads it
   * to withhold its mount auto-run — re-signing then needs an explicit click.
   * No TTL: unlike the WOTS marker it never suppresses an action, it only
   * converts an auto-run into a re-offer, so staying set is harmless.
   */
  payoutSignCanceledIds: ReadonlySet<string>;
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
 *
 * Sized against the continuation modal, not the dashboard row — it is the
 * harsher consumer. `PostDepositContinuationView` renders `ResumeWotsContent`
 * off the same `SUBMIT_WOTS_KEY` action, so a lapse while the VP is merely
 * slow to leave `PENDING_DEPOSITOR_WOTS_PK` bounces a parked user back to the
 * WOTS resume screen with nothing actually wrong. Twenty minutes clears
 * realistic daemon lag for that consumer while still recovering in one sitting.
 *
 * Recovery is bounded by this TTL plus one poll interval, not by the TTL
 * alone: nothing re-renders on the clock crossing the boundary. What carries
 * it is `refetchInterval` — a deposit stuck at `needsWotsKey` keeps polling
 * (it only stops at `pendingDepositorSignatures` or a terminal error) and the
 * queryFn returns fresh `Set`s, which React Query's structural sharing does
 * not descend into, so the deps change every tick and the row re-renders.
 */
const WOTS_SUBMISSION_SUPPRESSION_MS = 20 * 60 * 1000;

const EMPTY_STATE: OptimisticDepositState = {
  statuses: new Map(),
  refundBroadcastAt: new Map(),
  wotsSubmittedAt: new Map(),
  payoutSignCanceledIds: new Set(),
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
    payoutSignCanceledIds: currentState.payoutSignCanceledIds,
  });
}

export function markWotsSubmitted(depositId: string): void {
  // First write wins WITHIN the window: a repeat call must not slide the TTL
  // forward, or a retry loop could keep the action suppressed indefinitely.
  // Guard on freshness rather than presence, though — once the window has
  // lapsed the action is back on offer, and the submission that answers it
  // must re-arm the marker. Testing `.has()` would leave the expired
  // timestamp in place, so that second (successful) submission would get zero
  // suppression and the row would re-offer the button for the whole daemon-lag
  // window: the #2140 symptom, made permanent for that deposit.
  if (isWotsSubmissionWithinTtl(currentState.wotsSubmittedAt.get(depositId))) {
    return;
  }
  publish({
    statuses: currentState.statuses,
    refundBroadcastAt: currentState.refundBroadcastAt,
    wotsSubmittedAt: new Map(currentState.wotsSubmittedAt).set(
      depositId,
      Date.now(),
    ),
    payoutSignCanceledIds: currentState.payoutSignCanceledIds,
  });
}

/**
 * Record that the user's own cancel settled during this deposit's payout
 * signing. Written by `useDepositFlow` when the settled cancel breaks its
 * payout loop; read once at mount by `ResumeSignContent` so the continuation
 * handoff re-offers signing behind a click instead of re-prompting the device.
 */
export function markPayoutSignCanceled(depositId: string): void {
  // Repeat writes must not publish — same discipline as the setters above.
  if (currentState.payoutSignCanceledIds.has(depositId)) {
    return;
  }
  publish({
    statuses: currentState.statuses,
    refundBroadcastAt: currentState.refundBroadcastAt,
    wotsSubmittedAt: currentState.wotsSubmittedAt,
    payoutSignCanceledIds: new Set(currentState.payoutSignCanceledIds).add(
      depositId,
    ),
  });
}

/**
 * Whether this deposit's payout signing was cancelled by the user this
 * session. Tells a post-cancel re-offer apart from a first visit — the signal
 * `ResumeSignContent` needs to decide whether it may auto-sign on mount.
 */
export function hasPayoutSignCancelRecord(depositId: string): boolean {
  return currentState.payoutSignCanceledIds.has(depositId);
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
  now?: number,
): boolean {
  if (submittedAt === undefined) return false;
  const currentTime = now ?? Date.now();
  const elapsedMs = currentTime - submittedAt;
  // A timestamp ahead of the clock means the wall clock jumped backwards
  // after the submission was recorded (NTP step, manual change). Elapsed then
  // reads negative — inside the window under a bare `< TTL` — for as long as
  // the clock stays behind, so suppression would outlast the TTL by the size
  // of the jump. Treat it as expired instead: the re-offer waits for a click,
  // a redundant submission is a no-op the VP ignores, and `markWotsSubmitted`
  // re-arms against the corrected clock.
  return elapsedMs >= 0 && elapsedMs < WOTS_SUBMISSION_SUPPRESSION_MS;
}

/**
 * Whether this deposit's WOTS submission resolved at least once this session,
 * regardless of whether the suppression window is still open.
 *
 * Distinct from {@link isWotsSubmissionWithinTtl}, which asks "should the
 * action stay hidden". This asks "has the user already been through this
 * step", which is what tells a re-offer apart from a first visit — the
 * signal `ResumeWotsContent` needs to decide whether it may auto-submit on
 * mount or must wait for a click.
 */
export function hasWotsSubmissionRecord(depositId: string): boolean {
  return currentState.wotsSubmittedAt.has(depositId);
}

/**
 * Test-only reset: the store outlives any single provider, so cases asserting
 * suppression must start from a clean slate.
 */
export function resetOptimisticDepositState(): void {
  publish(EMPTY_STATE);
}
