import { describe, expect, it } from "vitest";

import {
  canWithdrawAnyVault,
  computeProjectedHealthFactor,
  getWithdrawHfWarningState,
  isHealthFactorAtOrAbove,
  isVaultIndividuallyWithdrawable,
  type PositionSnapshot,
} from "../withdrawEligibility";

// 1 BTC of collateral at current HF 1.6 (arbitrary but unambiguous).
// Splits used by the canWithdrawAnyVault tests below are [0.5, 0.3, 0.2].
const BASE_POSITION: PositionSnapshot = {
  collateralBtc: 1,
  currentHealthFactor: 1.6,
};

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

describe("computeProjectedHealthFactor", () => {
  it("returns Infinity when there is no debt", () => {
    expect(computeProjectedHealthFactor(null, 1, 0.3)).toBe(Infinity);
  });

  it("scales current HF by the remaining collateral ratio", () => {
    // Withdraw 0.3 of 1 BTC → 0.7 remains → HF drops by 0.7x.
    expect(computeProjectedHealthFactor(1.6, 1, 0.3)).toBeCloseTo(1.12, 5);
  });

  it("is zero when the full collateral is withdrawn with debt", () => {
    expect(computeProjectedHealthFactor(1.6, 1, 1)).toBe(0);
  });

  it("clamps remaining collateral at zero (never negative)", () => {
    expect(computeProjectedHealthFactor(1.6, 1, 2)).toBe(0);
  });

  it("returns zero when collateralBtc is zero and HF is defined", () => {
    expect(computeProjectedHealthFactor(1.6, 0, 0)).toBe(0);
  });
});

describe("isVaultIndividuallyWithdrawable", () => {
  it("treats any vault as withdrawable when there is no debt", () => {
    const noDebt: PositionSnapshot = {
      collateralBtc: 1,
      currentHealthFactor: null,
    };
    expect(isVaultIndividuallyWithdrawable(0.5, noDebt)).toBe(true);
    expect(isVaultIndividuallyWithdrawable(1, noDebt)).toBe(true);
  });

  it("allows withdrawal when projected HF stays at or above 1.0", () => {
    // 0.3 BTC out of 1 BTC at HF 1.6 → 1.6 * 0.7 = 1.12 ≥ 1.0
    expect(isVaultIndividuallyWithdrawable(0.3, BASE_POSITION)).toBe(true);
  });

  it("blocks withdrawal when projected HF would fall below 1.0", () => {
    // 0.5 BTC → 1.6 * 0.5 = 0.8 < 1.0
    expect(isVaultIndividuallyWithdrawable(0.5, BASE_POSITION)).toBe(false);
  });

  it("allows withdrawal that lands exactly at the 1.0 block threshold", () => {
    // Choose withdrawal that leaves HF = 1.0 exactly: remaining ratio = 1/HF
    // 1 / 1.6 = 0.625, so withdraw 0.375 leaves exactly HF 1.0.
    expect(isVaultIndividuallyWithdrawable(0.375, BASE_POSITION)).toBe(true);
  });

  it("allows withdrawal at the threshold even with tiny FP noise", () => {
    // Perturb inputs so floating-point error nudges the intermediate
    // computation; the exact-1.0 case must not flip to blocked.
    const noisy: PositionSnapshot = {
      collateralBtc: 1 + 1e-12,
      currentHealthFactor: 1.6 - 1e-12,
    };
    expect(isVaultIndividuallyWithdrawable(0.375, noisy)).toBe(true);
  });

  it("returns false when collateralBtc is zero (no vaults)", () => {
    const empty: PositionSnapshot = {
      collateralBtc: 0,
      currentHealthFactor: 1.6,
    };
    expect(isVaultIndividuallyWithdrawable(0, empty)).toBe(false);
  });
});

describe("canWithdrawAnyVault", () => {
  it("returns true when at least one in-use vault is individually withdrawable", () => {
    const vaults = [
      { amountBtc: 0.5, inUse: true }, // HF 0.8 → blocked
      { amountBtc: 0.3, inUse: true }, // HF 1.12 → allowed
      { amountBtc: 0.2, inUse: true }, // HF 1.28 → allowed
    ];
    expect(canWithdrawAnyVault(vaults, BASE_POSITION)).toBe(true);
  });

  it("returns false when every in-use vault would individually breach HF 1.0", () => {
    // Current HF low enough that even smallest vault breaches.
    // 0.2 BTC removal on HF 1.2 → 1.2 * 0.8 = 0.96 < 1.0.
    const lowHf: PositionSnapshot = {
      collateralBtc: 1,
      currentHealthFactor: 1.2,
    };
    const vaults = [
      { amountBtc: 0.5, inUse: true }, // 1.2 * 0.5 = 0.6
      { amountBtc: 0.3, inUse: true }, // 1.2 * 0.7 = 0.84
      { amountBtc: 0.2, inUse: true }, // 1.2 * 0.8 = 0.96
    ];
    expect(canWithdrawAnyVault(vaults, lowHf)).toBe(false);
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

describe("getWithdrawHfWarningState", () => {
  it("marks HF at or above 1.1 as safe (no warning, no block)", () => {
    expect(getWithdrawHfWarningState(1.2)).toEqual({
      wouldBreachHF: false,
      isAtRisk: false,
    });
    expect(getWithdrawHfWarningState(Infinity)).toEqual({
      wouldBreachHF: false,
      isAtRisk: false,
    });
  });

  it("marks HF between 1.0 and 1.1 as at-risk", () => {
    expect(getWithdrawHfWarningState(1.05)).toEqual({
      wouldBreachHF: false,
      isAtRisk: true,
    });
  });

  it("marks HF below 1.0 as blocking", () => {
    expect(getWithdrawHfWarningState(0.95)).toEqual({
      wouldBreachHF: true,
      isAtRisk: false,
    });
  });
});
