import { describe, expect, it } from "vitest";

import { computeCapSnapshot, computeEffectiveRemaining } from "../capMath";

describe("computeCapSnapshot", () => {
  it("collapses both caps to unlimited when cap values are zero", () => {
    const snap = computeCapSnapshot({
      caps: { totalCapBTC: 0n, perAddressCapBTC: 0n },
      totalBTC: 10n,
      userBTC: 4n,
    });
    expect(snap.hasTotalCap).toBe(false);
    expect(snap.hasPerAddressCap).toBe(false);
    expect(snap.remainingTotal).toBe(null);
    expect(snap.remainingForUser).toBe(null);
    expect(snap.effectiveRemaining).toBe(null);
  });

  it("clamps remaining to zero when usage exceeds cap", () => {
    const snap = computeCapSnapshot({
      caps: { totalCapBTC: 100n, perAddressCapBTC: 20n },
      totalBTC: 150n,
      userBTC: 25n,
    });
    expect(snap.remainingTotal).toBe(0n);
    expect(snap.remainingForUser).toBe(0n);
    expect(snap.effectiveRemaining).toBe(0n);
  });

  it("picks the smaller of total-remaining and user-remaining as effective remaining", () => {
    const snap = computeCapSnapshot({
      caps: { totalCapBTC: 1000n, perAddressCapBTC: 50n },
      totalBTC: 800n,
      userBTC: 30n,
    });
    expect(snap.remainingTotal).toBe(200n);
    expect(snap.remainingForUser).toBe(20n);
    expect(snap.effectiveRemaining).toBe(20n);
  });

  it("returns remainingForUser as null when no user is supplied", () => {
    const snap = computeCapSnapshot({
      caps: { totalCapBTC: 100n, perAddressCapBTC: 10n },
      totalBTC: 30n,
      userBTC: null,
    });
    expect(snap.remainingForUser).toBe(null);
    expect(snap.effectiveRemaining).toBe(70n);
  });
});

describe("computeEffectiveRemaining", () => {
  it("returns null when both remainings are null", () => {
    expect(computeEffectiveRemaining(null, null)).toBe(null);
  });

  it("returns the single non-null value when only one is present", () => {
    expect(computeEffectiveRemaining(10n, null)).toBe(10n);
    expect(computeEffectiveRemaining(null, 5n)).toBe(5n);
  });

  it("returns the minimum when both are present", () => {
    expect(computeEffectiveRemaining(10n, 5n)).toBe(5n);
    expect(computeEffectiveRemaining(3n, 7n)).toBe(3n);
  });
});
