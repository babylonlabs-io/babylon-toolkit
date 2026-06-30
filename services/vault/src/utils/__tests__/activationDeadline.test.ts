import { describe, expect, it } from "vitest";

import {
  ETH_SLOT_SECONDS,
  estimateActivationDeadlineLikelyPassed,
  isActivationDeadlinePassedOnChain,
} from "../activationDeadline";

describe("isActivationDeadlinePassedOnChain", () => {
  it("treats the boundary block (current == created + timeout) as NOT expired", () => {
    expect(
      isActivationDeadlinePassedOnChain({
        currentBlock: 1100n,
        createdAtBlock: 1000n,
        pegInActivationTimeout: 100n,
      }),
    ).toBe(false);
  });

  it("treats one block past the boundary as expired", () => {
    expect(
      isActivationDeadlinePassedOnChain({
        currentBlock: 1101n,
        createdAtBlock: 1000n,
        pegInActivationTimeout: 100n,
      }),
    ).toBe(true);
  });

  it("treats a block below the boundary as NOT expired", () => {
    expect(
      isActivationDeadlinePassedOnChain({
        currentBlock: 1050n,
        createdAtBlock: 1000n,
        pegInActivationTimeout: 100n,
      }),
    ).toBe(false);
  });
});

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

  it("exposes the Ethereum slot time as a 12s constant", () => {
    expect(ETH_SLOT_SECONDS).toBe(12);
  });
});
