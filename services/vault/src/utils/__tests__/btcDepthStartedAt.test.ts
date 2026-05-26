import { afterEach, describe, expect, it, vi } from "vitest";

import {
  commitBtcDepthStartedAt,
  getBtcDepthStartedAt,
} from "../btcDepthStartedAt";

// Module-level cache persists across the suite; isolate by using unique
// vault ids per test so we don't depend on `beforeEach` clearing it
// (the module deliberately exposes no reset for production safety).
const uniqueId = (() => {
  let n = 0;
  return () => `0xvault-${++n}-${Math.random().toString(36).slice(2)}`;
})();

describe("btcDepthStartedAt", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined for an uncommitted vault id", () => {
    expect(getBtcDepthStartedAt(uniqueId())).toBeUndefined();
  });

  it("returns the committed timestamp on subsequent reads", () => {
    const id = uniqueId();
    commitBtcDepthStartedAt(id, 1_700_000_000_000);
    expect(getBtcDepthStartedAt(id)).toBe(1_700_000_000_000);
  });

  // The cache must never overwrite an existing anchor — otherwise a
  // concurrent/abandoned-render commit could move the displayed wait clock
  // forward in time after the user already saw a value.
  it("is write-once: later commits with the same vault id are no-ops", () => {
    const id = uniqueId();
    commitBtcDepthStartedAt(id, 1_700_000_000_000);
    commitBtcDepthStartedAt(id, 1_700_000_999_999);
    expect(getBtcDepthStartedAt(id)).toBe(1_700_000_000_000);
  });

  // Regression: the cache is per-vault. Switching the active vault on
  // `PostDepositContinuationView` must not leak vault A's anchor into
  // vault B's reading, and switching back to A must restore A's original
  // anchor. Earlier round of this work held the anchor in component
  // useState, which trapped the wrong value on vault switch.
  it("keys anchors by vault id (A → B → A retains each vault's own anchor)", () => {
    const a = uniqueId();
    const b = uniqueId();

    commitBtcDepthStartedAt(a, 1_700_000_000_000);
    expect(getBtcDepthStartedAt(b)).toBeUndefined();

    commitBtcDepthStartedAt(b, 1_700_000_500_000);
    expect(getBtcDepthStartedAt(b)).toBe(1_700_000_500_000);

    // Switching back to A must restore A's original anchor, not B's.
    expect(getBtcDepthStartedAt(a)).toBe(1_700_000_000_000);
  });
});
