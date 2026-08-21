import { describe, expect, it } from "vitest";

import {
  computeNumLocalChallengers,
  deriveLocalChallengers,
} from "../challengers";

// 32-byte x-only keys (64 hex chars)
const VP_KEY =
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const VK1 = "1111111111111111111111111111111111111111111111111111111111111111";
const VK2 = "2222222222222222222222222222222222222222222222222222222222222222";
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
      computeNumLocalChallengers(
        compressedVP,
        [compressedVK],
        compressedDepositor,
      ),
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

describe("deriveLocalChallengers", () => {
  const base = {
    depositorBtcPubkey: DEPOSITOR,
    vaultProviderBtcPubkey: VP_KEY,
    vaultKeeperBtcPubkeys: [VK1, VK2],
  };

  it("returns vault keepers only when the depositor is the claimer", () => {
    expect(
      deriveLocalChallengers({ ...base, claimerBtcPubkey: DEPOSITOR }),
    ).toEqual([VK1, VK2]);
  });

  it("returns VP plus the other keepers when a vault keeper is the claimer", () => {
    expect(deriveLocalChallengers({ ...base, claimerBtcPubkey: VK1 })).toEqual(
      [VK2, VP_KEY].sort(),
    );
  });

  it("returns the keepers when the vault provider is the claimer", () => {
    expect(
      deriveLocalChallengers({ ...base, claimerBtcPubkey: VP_KEY }),
    ).toEqual([VK1, VK2].sort());
  });

  it("deduplicates a vault provider that also appears as a keeper", () => {
    expect(
      deriveLocalChallengers({
        ...base,
        vaultKeeperBtcPubkeys: [VP_KEY, VK1],
        claimerBtcPubkey: VK1,
      }),
    ).toEqual([VP_KEY]);
  });

  it("normalizes 0x-prefixed, compressed and mixed-case keys", () => {
    expect(
      deriveLocalChallengers({
        depositorBtcPubkey: `02${DEPOSITOR}`,
        vaultProviderBtcPubkey: `0x${VP_KEY.toUpperCase()}`,
        vaultKeeperBtcPubkeys: [`0x${VK1}`, `03${VK2}`],
        claimerBtcPubkey: DEPOSITOR,
      }),
    ).toEqual([VK1, VK2]);
  });

  it("throws when the depositor-claimer keeper set is empty", () => {
    expect(() =>
      deriveLocalChallengers({
        ...base,
        vaultKeeperBtcPubkeys: [DEPOSITOR],
        claimerBtcPubkey: DEPOSITOR,
      }),
    ).toThrow(/vault keeper set is empty/);
  });

  it("throws when the depositor-claimer keeper set has duplicates", () => {
    expect(() =>
      deriveLocalChallengers({
        ...base,
        vaultKeeperBtcPubkeys: [VK1, VK1],
        claimerBtcPubkey: DEPOSITOR,
      }),
    ).toThrow(/duplicate vaultKeeper key/);
  });

  it("throws when the claimer is the only vault provider or keeper", () => {
    expect(() =>
      deriveLocalChallengers({
        ...base,
        vaultKeeperBtcPubkeys: [VP_KEY],
        claimerBtcPubkey: VP_KEY,
      }),
    ).toThrow(/no vault provider or vault keeper remains/);
  });
});
