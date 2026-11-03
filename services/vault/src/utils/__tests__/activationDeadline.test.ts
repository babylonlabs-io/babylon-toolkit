import { describe, expect, it } from "vitest";

import {
  headBlockLagBlocks,
  isHeadBlockAheadOfClock,
  isHeadBlockStale,
} from "../activationDeadline";

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
