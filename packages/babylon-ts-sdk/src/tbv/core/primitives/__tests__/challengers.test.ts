import { describe, expect, it } from "vitest";

import { computeNumLocalChallengers } from "../challengers";

// 32-byte x-only keys (64 hex chars)
const VP_KEY =
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const VK1 =
  "1111111111111111111111111111111111111111111111111111111111111111";
const VK2 =
  "2222222222222222222222222222222222222222222222222222222222222222";
const DEPOSITOR =
  "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

describe("computeNumLocalChallengers", () => {
  it("counts VP + VKs when depositor is not in the set", () => {
    expect(computeNumLocalChallengers(VP_KEY, [VK1, VK2], DEPOSITOR)).toBe(3);
  });

  it("excludes depositor when depositor == VP", () => {
    expect(computeNumLocalChallengers(VP_KEY, [VK1, VK2], VP_KEY)).toBe(2);
  });

  it("excludes depositor when depositor == one VK", () => {
    expect(computeNumLocalChallengers(VP_KEY, [VK1, VK2], VK1)).toBe(2);
  });

  it("deduplicates when VP == a VK", () => {
    expect(computeNumLocalChallengers(VP_KEY, [VP_KEY, VK1], DEPOSITOR)).toBe(
      2,
    );
  });

  it("handles 0x-prefixed keys", () => {
    expect(
      computeNumLocalChallengers(`0x${VP_KEY}`, [`0x${VK1}`], DEPOSITOR),
    ).toBe(2);
  });

  it("handles compressed (33-byte) keys by normalizing to x-only", () => {
    // 02 prefix + 32 bytes = compressed pubkey
    const compressedVP = `02${VP_KEY}`;
    const compressedVK = `03${VK1}`;
    const compressedDepositor = `02${DEPOSITOR}`;
    expect(
      computeNumLocalChallengers(compressedVP, [compressedVK], compressedDepositor),
    ).toBe(2);
  });

  it("normalizes case for comparison", () => {
    expect(
      computeNumLocalChallengers(
        VP_KEY.toUpperCase(),
        [VK1],
        VP_KEY.toLowerCase(),
      ),
    ).toBe(1);
  });

  it("returns 0 when only participant is the depositor", () => {
    expect(computeNumLocalChallengers(VP_KEY, [], VP_KEY)).toBe(0);
  });

  it("counts correctly with no VKs", () => {
    expect(computeNumLocalChallengers(VP_KEY, [], DEPOSITOR)).toBe(1);
  });
});
