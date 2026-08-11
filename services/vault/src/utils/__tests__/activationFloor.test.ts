import { describe, expect, it } from "vitest";

import {
  activationFloorBlocksRemaining,
  activationFloorMinutesRemaining,
} from "../activationFloor";

describe("activationFloorBlocksRemaining", () => {
  it("returns the full delay at the verification block", () => {
    expect(
      activationFloorBlocksRemaining({
        currentBlock: 1000n,
        verifiedAt: 1000n,
        peginActivationDelay: 150n,
      }),
    ).toBe(150);
  });

  it("counts down as blocks arrive", () => {
    expect(
      activationFloorBlocksRemaining({
        currentBlock: 1100n,
        verifiedAt: 1000n,
        peginActivationDelay: 150n,
      }),
    ).toBe(50);
  });

  it("returns 0 exactly at the boundary, matching the contract's inclusive check", () => {
    // Contract reverts on `block.number < verifiedAt + delay`, so 1150 passes.
    expect(
      activationFloorBlocksRemaining({
        currentBlock: 1150n,
        verifiedAt: 1000n,
        peginActivationDelay: 150n,
      }),
    ).toBe(0);
  });

  it("returns 0 one block before the boundary is not reported as open", () => {
    expect(
      activationFloorBlocksRemaining({
        currentBlock: 1149n,
        verifiedAt: 1000n,
        peginActivationDelay: 150n,
      }),
    ).toBe(1);
  });

  it("returns 0 well past the boundary rather than a negative count", () => {
    expect(
      activationFloorBlocksRemaining({
        currentBlock: 9999n,
        verifiedAt: 1000n,
        peginActivationDelay: 150n,
      }),
    ).toBe(0);
  });

  it("is never gated when the delay is 0 (the protocol's disabled value)", () => {
    expect(
      activationFloorBlocksRemaining({
        currentBlock: 1000n,
        verifiedAt: 1000n,
        peginActivationDelay: 0n,
      }),
    ).toBe(0);
  });
});

describe("activationFloorMinutesRemaining", () => {
  it("converts 150 blocks to 30 minutes at a 12s slot", () => {
    expect(activationFloorMinutesRemaining(150)).toBe(30);
  });

  it("returns 0 when no blocks remain", () => {
    expect(activationFloorMinutesRemaining(0)).toBe(0);
  });

  it("reports at least a minute while any block remains", () => {
    // 1 block is 12s; reporting "~0 min" beside a disabled button reads as a bug.
    expect(activationFloorMinutesRemaining(1)).toBe(1);
  });

  it("rounds up so the estimate never promises the window early", () => {
    // 6 blocks = 72s = 1.2 min.
    expect(activationFloorMinutesRemaining(6)).toBe(2);
  });
});
