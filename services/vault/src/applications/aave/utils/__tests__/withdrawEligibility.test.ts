import { describe, expect, it } from "vitest";

import {
  computeProjectedHealthFactor,
  getWithdrawHfWarningState,
  isHealthFactorAtOrAbove,
} from "../withdrawEligibility";

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
