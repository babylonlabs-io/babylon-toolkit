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
    liquidationThresholdBps: 8000,
    currentHealthFactor: 1.6,
  };

  it("shows current values when repayAmount is 0", () => {
    const result = useRepayMetrics({
      ...baseProps,
      repayAmount: 0,
      tokenPriceUsd: 1,
    });

    expect(result.healthFactorValue).toBe(1.6);
    expect(result.borrowRatioOriginal).toBeUndefined();
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

  it("shows current values when tokenPriceUsd is null", () => {
    const result = useRepayMetrics({
      ...baseProps,
      repayAmount: 1000,
      tokenPriceUsd: null,
    });

    // Should return current values with no projection, same as repayAmount=0
    expect(result.healthFactorValue).toBe(1.6);
    expect(result.borrowRatioOriginal).toBeUndefined();
  });

  it("clamps projected debt to zero (no negative debt)", () => {
    // Repay more than total debt
    const result = useRepayMetrics({
      ...baseProps,
      repayAmount: 10000,
      tokenPriceUsd: 1,
    });

    expect(result.healthFactorValue).toBe(Infinity);
  });
});
