import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocalStorageStatus } from "@/models/peginStateMachine";

import {
  getOptimisticDepositState,
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
    expect(getOptimisticDepositState().wotsSubmitted.has(DEPOSIT_ID)).toBe(
      true,
    );
  });

  it("keeps the snapshot reference stable when the same wots submission is recorded twice", () => {
    markWotsSubmitted(DEPOSIT_ID);
    const after = getOptimisticDepositState();
    markWotsSubmitted(DEPOSIT_ID);
    expect(getOptimisticDepositState()).toBe(after);
  });
});
