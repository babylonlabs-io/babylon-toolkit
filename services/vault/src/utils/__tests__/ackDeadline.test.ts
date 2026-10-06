import { describe, expect, it } from "vitest";

import {
  ackDeadlineBlocksRemaining,
  prePeginBroadcastAckMarginBlocks,
} from "../ackDeadline";

describe("ackDeadlineBlocksRemaining", () => {
  // createdAt 1000 + timeout 100: the contract still accepts an ACK mined at
  // block 1100 (PeginLogic.submitACK reverts only when block.number >
  // createdAt + pegInAckTimeout).
  it("counts the blocks still mineable before the deadline", () => {
    expect(
      ackDeadlineBlocksRemaining({
        currentBlock: 1_000n,
        createdAtBlock: 1_000n,
        pegInAckTimeout: 100n,
      }),
    ).toBe(100);
  });

  it("leaves one block when the head is one below the deadline", () => {
    expect(
      ackDeadlineBlocksRemaining({
        currentBlock: 1_099n,
        createdAtBlock: 1_000n,
        pegInAckTimeout: 100n,
      }),
    ).toBe(1);
  });

  it("leaves nothing once the head is the deadline block", () => {
    // The next block to be mined is already past the deadline.
    expect(
      ackDeadlineBlocksRemaining({
        currentBlock: 1_100n,
        createdAtBlock: 1_000n,
        pegInAckTimeout: 100n,
      }),
    ).toBe(0);
  });

  it("floors at zero past the deadline instead of going negative", () => {
    expect(
      ackDeadlineBlocksRemaining({
        currentBlock: 1_500n,
        createdAtBlock: 1_000n,
        pegInAckTimeout: 100n,
      }),
    ).toBe(0);
  });
});

describe("prePeginBroadcastAckMarginBlocks", () => {
  it("is the machine-paced acknowledgment estimate in Ethereum blocks at depth 6", () => {
    // 6 confirmations × 10 min + the 10 min pipeline allowance + 15 min for
    // the keepers to receive the finalized signature-batch event = 85 min,
    // which is 5100 s, or 425 twelve-second slots.
    expect(prePeginBroadcastAckMarginBlocks(6)).toBe(425);
  });

  it("grows with the required confirmation depth", () => {
    // 12 × 10 + 10 + 15 = 145 min = 8700 s = 725 slots.
    expect(prePeginBroadcastAckMarginBlocks(12)).toBe(725);
  });
});
