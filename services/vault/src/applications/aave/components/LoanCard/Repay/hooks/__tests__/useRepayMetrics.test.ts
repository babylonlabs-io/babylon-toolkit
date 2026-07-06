/**
 * Tests for useRepayMetrics
 *
 * Verifies that repayAmount (in token units) is correctly converted
 * to USD via tokenPriceUsd for health factor projections.
 */

import { describe, expect, it } from "vitest";

import { useRepayMetrics } from "../useRepayMetrics";

describe("useRepayMetrics", () => {
  const baseProps = {
    collateralValueUsd: 10000,
    totalDebtValueUsd: 5000,
    currentDebtAmount: 5000,
    liquidationThresholdBps: 8000,
    currentHealthFactor: 1.6,
  };

  it("shows current values with no debt projection when repayAmount is 0", () => {
    const result = useRepayMetrics({
      ...baseProps,
      repayAmount: 0,
      tokenPriceUsd: 1,
    });

    expect(result.healthFactorValue).toBe(1.6);
    expect(result.debtCurrent).toBe(5000);
    expect(result.debtProjected).toBeUndefined();
  });

  it("projects debt in token units (current minus repay amount)", () => {
    const result = useRepayMetrics({
      ...baseProps,
      repayAmount: 1000,
      tokenPriceUsd: 1,
    });

    expect(result.debtCurrent).toBe(5000);
    expect(result.debtProjected).toBe(4000);
  });

  it("converts token units to USD using tokenPriceUsd for debt projection", () => {
    // Repay 1000 tokens at $1 = $1000 debt reduction
    // Projected debt = $5000 - $1000 = $4000
    // HF = (10000 * 0.8) / 4000 = 2.0
    const result = useRepayMetrics({
      ...baseProps,
      repayAmount: 1000,
      tokenPriceUsd: 1,
    });

    expect(result.healthFactorValue).toBeCloseTo(2.0, 5);
  });

  it("correctly handles non-$1 token prices", () => {
    // Repay 2 tokens at $1500 each = $3000 debt reduction
    // Projected debt = $5000 - $3000 = $2000
    // HF = (10000 * 0.8) / 2000 = 4.0
    const result = useRepayMetrics({
      ...baseProps,
      repayAmount: 2,
      tokenPriceUsd: 1500,
    });

    expect(result.healthFactorValue).toBeCloseTo(4.0, 5);
  });

  it("returns Infinity health factor when full repayment", () => {
    // Repay 5000 tokens at $1 = $5000 = full debt
    const result = useRepayMetrics({
      ...baseProps,
      repayAmount: 5000,
      tokenPriceUsd: 1,
    });

    expect(result.healthFactorValue).toBe(Infinity);
  });

  it("shows current health factor but still projects debt when tokenPriceUsd is null", () => {
    const result = useRepayMetrics({
      ...baseProps,
      repayAmount: 1000,
      tokenPriceUsd: null,
    });

    // Health factor needs the USD price, so it shows the current value only.
    expect(result.healthFactorValue).toBe(1.6);
    expect(result.healthFactorOriginal).toBeUndefined();
    // Debt is token-unit math, so it projects regardless of price availability.
    expect(result.debtCurrent).toBe(5000);
    expect(result.debtProjected).toBe(4000);
  });

  it("clamps projected debt to zero (no negative debt)", () => {
    // Repay more than total debt
    const result = useRepayMetrics({
      ...baseProps,
      repayAmount: 10000,
      tokenPriceUsd: 1,
    });

    expect(result.healthFactorValue).toBe(Infinity);
    expect(result.debtProjected).toBe(0);
  });

  it("treats residual debt below relative threshold as full repayment", () => {
    // Reproduces slider snapping one step short of max: residual ~0.1% of total
    // debt would otherwise produce an astronomical HF (e.g. 6324) instead of "-".
    const result = useRepayMetrics({
      collateralValueUsd: 800,
      totalDebtValueUsd: 96.16,
      currentDebtAmount: 96.256,
      liquidationThresholdBps: 7525,
      currentHealthFactor: 6.32,
      repayAmount: 96.157584162,
      tokenPriceUsd: 0.999,
    });

    expect(result.healthFactorValue).toBe(Infinity);
    expect(result.healthFactor).toBe("-");
    expect(result.healthFactorOriginal).toBeUndefined();
  });

  it("does not mask deliberate residual debt on large positions", () => {
    // $100k debt, user deliberately repays down to $300 remaining.
    // Without an absolute cap on the relative threshold ($500 at 0.5%),
    // the $300 residual would be hidden behind "-" / 0% borrow ratio.
    const result = useRepayMetrics({
      collateralValueUsd: 200000,
      totalDebtValueUsd: 100000,
      currentDebtAmount: 100000,
      liquidationThresholdBps: 8000,
      currentHealthFactor: 1.6,
      repayAmount: 99700,
      tokenPriceUsd: 1,
    });

    expect(result.healthFactorValue).not.toBe(Infinity);
    expect(result.healthFactor).not.toBe("-");
    expect(result.healthFactorOriginal).toBeDefined();
  });
});
