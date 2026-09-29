import { beforeEach, describe, expect, it, vi } from "vitest";

const getBlockNumber = vi.hoisted(() => vi.fn());

vi.mock("../client", () => ({
  ethClient: { getPublicClient: () => ({ getBlockNumber }) },
}));

import { resolvePinnedReadBlock } from "../pinnedReadBlock";

describe("resolvePinnedReadBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("steps back from the head so a replica one block behind can still serve the read", async () => {
    getBlockNumber.mockResolvedValue(1_000_000n);

    await expect(resolvePinnedReadBlock()).resolves.toBe(999_998n);
  });

  it("steps back to block zero at exactly the lag height", async () => {
    // The boundary: block zero is a legal anchor, so this must step back
    // rather than fall through to the short-chain branch.
    getBlockNumber.mockResolvedValue(2n);

    await expect(resolvePinnedReadBlock()).resolves.toBe(0n);
  });

  it("returns the head itself on a chain too short to step back", async () => {
    getBlockNumber.mockResolvedValue(1n);

    await expect(resolvePinnedReadBlock()).resolves.toBe(1n);
  });
});
