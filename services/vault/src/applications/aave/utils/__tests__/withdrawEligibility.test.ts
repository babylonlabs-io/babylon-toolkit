import { describe, expect, it } from "vitest";

import {
  canWithdrawAnyVault,
  computeProjectedHealthFactor,
  getVaultWithdrawalUsd,
  isHealthFactorAtOrAbove,
  isVaultIndividuallyWithdrawable,
  type PositionSnapshot,
} from "../withdrawEligibility";

// $10,000 collateral, $5,000 debt, 80% LT → HF = 10000*0.8/5000 = 1.6
// Collateral is 1 BTC total, split as [0.5, 0.3, 0.2].
const BASE_POSITION: PositionSnapshot = {
  collateralBtc: 1,
  collateralValueUsd: 10000,
  debtValueUsd: 5000,
  liquidationThresholdBps: 8000,
};

describe("getVaultWithdrawalUsd", () => {
  it("returns proportional USD share of total collateral", () => {
    expect(getVaultWithdrawalUsd(0.3, 1, 10000)).toBe(3000);
  });

  it("throws when total collateral BTC is zero", () => {
    expect(() => getVaultWithdrawalUsd(0.1, 0, 10000)).toThrow();
  });

  it("throws when total collateral BTC is negative", () => {
    expect(() => getVaultWithdrawalUsd(0.1, -1, 10000)).toThrow();
  });
});

describe("computeProjectedHealthFactor", () => {
  it("returns Infinity when there is no debt", () => {
    expect(computeProjectedHealthFactor(10000, 3000, 0, 8000)).toBe(Infinity);
  });

  it("recomputes HF on the remaining collateral after withdrawal", () => {
    // $10,000 - $3,000 = $7,000 remaining, $5,000 debt, 80% LT → HF = 1.12
    const hf = computeProjectedHealthFactor(10000, 3000, 5000, 8000);
    expect(hf).toBeCloseTo(1.12, 5);
  });

  it("clamps remaining collateral at zero (never negative)", () => {
    // Withdrawing more than total collateral still produces HF = 0, not negative
    expect(computeProjectedHealthFactor(10000, 12000, 5000, 8000)).toBe(0);
  });
});

describe("isHealthFactorAtOrAbove", () => {
  it("returns true for values exactly equal to the threshold", () => {
    expect(isHealthFactorAtOrAbove(1.0, 1.0)).toBe(true);
  });

  it("tolerates sub-1e-9 float error below the threshold", () => {
    // Proportional scaling can compute 0.9999999999... when the true
    // value is 1.0. The helper treats these as at-threshold.
    expect(isHealthFactorAtOrAbove(1.0 - 1e-12, 1.0)).toBe(true);
  });

  it("rejects values meaningfully below the threshold", () => {
    expect(isHealthFactorAtOrAbove(0.9999, 1.0)).toBe(false);
  });

  it("accepts Infinity (no debt) against any threshold", () => {
    expect(isHealthFactorAtOrAbove(Infinity, 1.1)).toBe(true);
  });
});

describe("isVaultIndividuallyWithdrawable", () => {
  it("treats any vault as withdrawable when there is no debt", () => {
    const noDebt = { ...BASE_POSITION, debtValueUsd: 0 };
    expect(isVaultIndividuallyWithdrawable(0.5, noDebt)).toBe(true);
    expect(isVaultIndividuallyWithdrawable(1, noDebt)).toBe(true);
  });

  it("allows withdrawal when projected HF stays at or above 1.0", () => {
    // Remove 0.3 BTC → remaining $7,000, debt $5,000, 80% LT → HF 1.12 ≥ 1.0
    expect(isVaultIndividuallyWithdrawable(0.3, BASE_POSITION)).toBe(true);
  });

  it("blocks withdrawal when projected HF would fall below 1.0", () => {
    // Remove 0.5 BTC → remaining $5,000, debt $5,000, 80% LT → HF 0.8 < 1.0
    expect(isVaultIndividuallyWithdrawable(0.5, BASE_POSITION)).toBe(false);
  });

  it("allows withdrawal that lands exactly at the 1.0 block threshold", () => {
    // Choose withdrawal that leaves HF = 1.0 exactly: remaining = debt / LT
    // debt/LT = 5000 / 0.8 = 6250; withdraw value = 10000 - 6250 = 3750
    // → vault BTC = 3750/10000 * 1 = 0.375
    expect(isVaultIndividuallyWithdrawable(0.375, BASE_POSITION)).toBe(true);
  });

  it("allows withdrawal at the threshold even with tiny FP noise in inputs", () => {
    // Real oracle values come back with long decimal tails. Simulate that
    // by perturbing inputs by ~1e-10; the exact-1.0 case must not flip
    // to blocked purely due to float error.
    const noisy: PositionSnapshot = {
      collateralBtc: 1 + 1e-12,
      collateralValueUsd: 10000 + 1e-8,
      debtValueUsd: 5000 - 1e-8,
      liquidationThresholdBps: 8000,
    };
    expect(isVaultIndividuallyWithdrawable(0.375, noisy)).toBe(true);
  });

  it("returns false when collateralBtc is zero (no vaults)", () => {
    const empty: PositionSnapshot = { ...BASE_POSITION, collateralBtc: 0 };
    expect(isVaultIndividuallyWithdrawable(0, empty)).toBe(false);
  });
});

describe("canWithdrawAnyVault", () => {
  it("returns true when at least one in-use vault is individually withdrawable", () => {
    const vaults = [
      { amountBtc: 0.5, inUse: true }, // would drop HF to 0.8 → blocked
      { amountBtc: 0.3, inUse: true }, // would drop HF to 1.12 → allowed
      { amountBtc: 0.2, inUse: true }, // would drop HF to 1.28 → allowed
    ];
    expect(canWithdrawAnyVault(vaults, BASE_POSITION)).toBe(true);
  });

  it("returns false when every in-use vault would individually breach HF 1.0", () => {
    // Shift debt up so even smallest vault breaches: debt $7,900
    // Remove 0.2 BTC → remaining $8,000, HF = 8000*0.8/7900 ≈ 0.810 < 1.0
    const heavyDebt: PositionSnapshot = {
      ...BASE_POSITION,
      debtValueUsd: 7900,
    };
    const vaults = [
      { amountBtc: 0.5, inUse: true },
      { amountBtc: 0.3, inUse: true },
      { amountBtc: 0.2, inUse: true },
    ];
    expect(canWithdrawAnyVault(vaults, heavyDebt)).toBe(false);
  });

  it("ignores vaults that are not in use", () => {
    const vaults = [
      { amountBtc: 0.3, inUse: false }, // would be safe, but not in use
      { amountBtc: 0.5, inUse: true }, // in use but would breach HF
    ];
    expect(canWithdrawAnyVault(vaults, BASE_POSITION)).toBe(false);
  });

  it("returns false for an empty vault list", () => {
    expect(canWithdrawAnyVault([], BASE_POSITION)).toBe(false);
  });
});
