import { describe, expect, it } from "vitest";

import {
  estimateActivationDeadlineLikelyPassed,
  headBlockLagBlocks,
  isHeadBlockAheadOfClock,
  isHeadBlockStale,
} from "../activationDeadline";

describe("estimateActivationDeadlineLikelyPassed", () => {
  it("returns false when well within the window", () => {
    // 120s elapsed at 12s/slot = 10 blocks, far below the 100-block timeout.
    expect(
      estimateActivationDeadlineLikelyPassed({
        createdAtMs: 1_000_000,
        nowMs: 1_120_000,
        pegInActivationTimeout: 100n,
      }),
    ).toBe(false);
  });

  it("returns true when the estimate is past the window", () => {
    // 1320s elapsed at 12s/slot = 110 blocks, above the 100-block timeout.
    expect(
      estimateActivationDeadlineLikelyPassed({
        createdAtMs: 1_000_000,
        nowMs: 2_320_000,
        pegInActivationTimeout: 100n,
      }),
    ).toBe(true);
  });

  it("returns false at exactly one block under the threshold", () => {
    // 1188s elapsed at 12s/slot = 99 blocks, one below the 100-block timeout.
    expect(
      estimateActivationDeadlineLikelyPassed({
        createdAtMs: 1_000_000,
        nowMs: 2_188_000,
        pegInActivationTimeout: 100n,
      }),
    ).toBe(false);
  });

  it("returns true at exactly the threshold", () => {
    // 1200s elapsed at 12s/slot = 100 blocks, equal to the 100-block timeout.
    expect(
      estimateActivationDeadlineLikelyPassed({
        createdAtMs: 1_000_000,
        nowMs: 2_200_000,
        pegInActivationTimeout: 100n,
      }),
    ).toBe(true);
  });

  it("treats negative elapsed time (createdAtMs in the future) as not passed", () => {
    expect(
      estimateActivationDeadlineLikelyPassed({
        createdAtMs: 2_000_000,
        nowMs: 1_000_000,
        pegInActivationTimeout: 100n,
      }),
    ).toBe(false);
  });

  it("honors a slotSeconds override", () => {
    // 600s elapsed at 6s/slot = 100 blocks, reaching the 100-block timeout.
    expect(
      estimateActivationDeadlineLikelyPassed({
        createdAtMs: 1_000_000,
        nowMs: 1_600_000,
        pegInActivationTimeout: 100n,
        slotSeconds: 6,
      }),
    ).toBe(true);

    // Same 600s elapsed at the 12s default = 50 blocks, below the timeout.
    expect(
      estimateActivationDeadlineLikelyPassed({
        createdAtMs: 1_000_000,
        nowMs: 1_600_000,
        pegInActivationTimeout: 100n,
      }),
    ).toBe(false);
  });

  it("defaults to the fastest realistic cadence, so it over-counts elapsed blocks and never misses an expiry", () => {
    // 12s is the slot floor — real slots can only be slower — so the block
    // estimate is an upper bound. 1200s at 12s = 100 blocks, reaching the timeout.
    expect(
      estimateActivationDeadlineLikelyPassed({
        createdAtMs: 0,
        nowMs: 1_200_000,
        pegInActivationTimeout: 100n,
      }),
    ).toBe(true);

    // Same wall time at a slower cadence is only 80 blocks, so a `false` means
    // "definitely inside the window", not "probably".
    expect(
      estimateActivationDeadlineLikelyPassed({
        createdAtMs: 0,
        nowMs: 1_200_000,
        pegInActivationTimeout: 100n,
        slotSeconds: 15,
      }),
    ).toBe(false);
  });
});

describe("isHeadBlockStale", () => {
  const NOW_MS = 1_700_000_000_000;
  const NOW_SECONDS = 1_700_000_000n;

  it("accepts a head exactly 120 seconds old", () => {
    expect(isHeadBlockStale(NOW_SECONDS - 120n, NOW_MS)).toBe(false);
  });

  it("rejects a head 121 seconds old", () => {
    expect(isHeadBlockStale(NOW_SECONDS - 121n, NOW_MS)).toBe(true);
  });

  it("accepts a head stamped slightly ahead of this device's clock", () => {
    expect(isHeadBlockStale(NOW_SECONDS + 5n, NOW_MS)).toBe(false);
  });
});

describe("isHeadBlockAheadOfClock", () => {
  const NOW_MS = 1_700_000_000_000;
  const NOW_SECONDS = 1_700_000_000n;

  it("accepts a head stamped one slot ahead, as ordinary clock drift", () => {
    expect(isHeadBlockAheadOfClock(NOW_SECONDS + 12n, NOW_MS)).toBe(false);
  });

  it("rejects a head stamped more than one slot ahead, since the clock is slow", () => {
    expect(isHeadBlockAheadOfClock(NOW_SECONDS + 13n, NOW_MS)).toBe(true);
  });

  it("accepts a head stamped in the past", () => {
    expect(isHeadBlockAheadOfClock(NOW_SECONDS - 120n, NOW_MS)).toBe(false);
  });
});

describe("headBlockLagBlocks", () => {
  const NOW_MS = 1_700_000_000_000;
  const NOW_SECONDS = 1_700_000_000n;

  it("counts no lag for a head from this second", () => {
    expect(headBlockLagBlocks(NOW_SECONDS, NOW_MS)).toBe(0n);
  });

  it("rounds a partial slot up, so the lag is an upper bound", () => {
    expect(headBlockLagBlocks(NOW_SECONDS - 1n, NOW_MS)).toBe(1n);
    expect(headBlockLagBlocks(NOW_SECONDS - 12n, NOW_MS)).toBe(1n);
    expect(headBlockLagBlocks(NOW_SECONDS - 13n, NOW_MS)).toBe(2n);
  });

  it("counts ten blocks at the oldest accepted age", () => {
    expect(headBlockLagBlocks(NOW_SECONDS - 120n, NOW_MS)).toBe(10n);
  });

  it("counts no lag for a head stamped ahead of this device's clock", () => {
    expect(headBlockLagBlocks(NOW_SECONDS + 5n, NOW_MS)).toBe(0n);
  });
});
