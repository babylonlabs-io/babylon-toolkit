import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalStorageStatus } from "@/models/peginStateMachine";

import {
  getOptimisticDepositState,
  isWotsSubmissionWithinTtl,
  markWotsSubmitted,
  resetOptimisticDepositState,
  setOptimisticDepositStatus,
  subscribeToOptimisticDepositState,
} from "../optimisticDepositState";

const DEPOSIT_ID = "0xdeposit";

describe("optimisticDepositState", () => {
  beforeEach(() => {
    resetOptimisticDepositState();
  });

  // Restored here, not at the end of each timer test: a failing assertion would
  // otherwise leak fake timers into every later test in the run.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the identical snapshot reference when nothing has been written", () => {
    // `useSyncExternalStore` re-renders whenever the snapshot identity changes,
    // so an unchanged read returning a fresh object would loop forever.
    expect(getOptimisticDepositState()).toBe(getOptimisticDepositState());
  });

  it("returns a new snapshot reference after a status is set", () => {
    const before = getOptimisticDepositState();
    setOptimisticDepositStatus(DEPOSIT_ID, LocalStorageStatus.PAYOUT_SIGNED);
    expect(getOptimisticDepositState()).not.toBe(before);
  });

  it("records the status against the deposit id", () => {
    setOptimisticDepositStatus(DEPOSIT_ID, LocalStorageStatus.PAYOUT_SIGNED);
    expect(getOptimisticDepositState().statuses.get(DEPOSIT_ID)).toBe(
      LocalStorageStatus.PAYOUT_SIGNED,
    );
  });

  it("records the refund broadcast timestamp when one is supplied", () => {
    setOptimisticDepositStatus(
      DEPOSIT_ID,
      LocalStorageStatus.REFUND_BROADCAST,
      1_700_000_000_000,
    );
    expect(getOptimisticDepositState().refundBroadcastAt.get(DEPOSIT_ID)).toBe(
      1_700_000_000_000,
    );
  });

  it("notifies subscribers when a status is set", () => {
    const listener = vi.fn();
    subscribeToOptimisticDepositState(listener);
    setOptimisticDepositStatus(DEPOSIT_ID, LocalStorageStatus.CONFIRMING);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying a subscriber after it unsubscribes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToOptimisticDepositState(listener);
    unsubscribe();
    setOptimisticDepositStatus(DEPOSIT_ID, LocalStorageStatus.CONFIRMING);
    expect(listener).not.toHaveBeenCalled();
  });

  it("records a wots submission", () => {
    markWotsSubmitted(DEPOSIT_ID);
    expect(getOptimisticDepositState().wotsSubmittedAt.has(DEPOSIT_ID)).toBe(
      true,
    );
  });

  it("keeps the snapshot reference stable when the same wots submission is recorded twice", () => {
    markWotsSubmitted(DEPOSIT_ID);
    const after = getOptimisticDepositState();
    markWotsSubmitted(DEPOSIT_ID);
    expect(getOptimisticDepositState()).toBe(after);
  });

  it("keeps the snapshot reference stable when the same status is set twice", () => {
    // The marker writers are idempotent, so the status writer must be too:
    // a redundant publish re-renders every mounted provider for a snapshot
    // that compares equal.
    setOptimisticDepositStatus(DEPOSIT_ID, LocalStorageStatus.PAYOUT_SIGNED);
    const after = getOptimisticDepositState();
    setOptimisticDepositStatus(DEPOSIT_ID, LocalStorageStatus.PAYOUT_SIGNED);
    expect(getOptimisticDepositState()).toBe(after);
  });

  it("still publishes when a repeat status write carries a new refund timestamp", () => {
    setOptimisticDepositStatus(
      DEPOSIT_ID,
      LocalStorageStatus.REFUND_BROADCAST,
      1_700_000_000_000,
    );
    const after = getOptimisticDepositState();
    setOptimisticDepositStatus(
      DEPOSIT_ID,
      LocalStorageStatus.REFUND_BROADCAST,
      1_700_000_999_000,
    );
    expect(getOptimisticDepositState()).not.toBe(after);
    expect(getOptimisticDepositState().refundBroadcastAt.get(DEPOSIT_ID)).toBe(
      1_700_000_999_000,
    );
  });

  it("preserves a stored refund timestamp when a repeat status write omits one", () => {
    setOptimisticDepositStatus(
      DEPOSIT_ID,
      LocalStorageStatus.REFUND_BROADCAST,
      1_700_000_000_000,
    );
    setOptimisticDepositStatus(DEPOSIT_ID, LocalStorageStatus.REFUND_BROADCAST);
    expect(getOptimisticDepositState().refundBroadcastAt.get(DEPOSIT_ID)).toBe(
      1_700_000_000_000,
    );
  });

  it("suppresses a submission recorded moments ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00Z"));
    markWotsSubmitted(DEPOSIT_ID);

    vi.advanceTimersByTime(60_000);

    expect(
      isWotsSubmissionWithinTtl(
        getOptimisticDepositState().wotsSubmittedAt.get(DEPOSIT_ID),
      ),
    ).toBe(true);
  });

  it("stops suppressing once the submission is older than the ttl", () => {
    // The whole point of the bound: a vault provider still asking for a key
    // long after our submission resolved is asking for real, and the user
    // needs the action back to answer it.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00Z"));
    markWotsSubmitted(DEPOSIT_ID);

    vi.advanceTimersByTime(11 * 60 * 1000);

    expect(
      isWotsSubmissionWithinTtl(
        getOptimisticDepositState().wotsSubmittedAt.get(DEPOSIT_ID),
      ),
    ).toBe(false);
  });

  it("never suppresses a deposit with no recorded submission", () => {
    expect(isWotsSubmissionWithinTtl(undefined)).toBe(false);
  });

  it("keeps the original timestamp when the same submission is recorded twice", () => {
    // A retry that re-recorded would slide the TTL forward and could keep the
    // action suppressed indefinitely.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00Z"));
    markWotsSubmitted(DEPOSIT_ID);
    const first = getOptimisticDepositState().wotsSubmittedAt.get(DEPOSIT_ID);

    vi.advanceTimersByTime(5 * 60 * 1000);
    markWotsSubmitted(DEPOSIT_ID);

    expect(getOptimisticDepositState().wotsSubmittedAt.get(DEPOSIT_ID)).toBe(
      first,
    );
  });
});
