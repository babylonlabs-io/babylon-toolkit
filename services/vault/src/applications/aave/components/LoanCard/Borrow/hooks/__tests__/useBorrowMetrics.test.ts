/**
 * Tests for useBorrowMetrics
 *
 * Verifies that borrowAmount (in token units) is correctly converted
 * to USD via tokenPriceUsd for health factor and borrow ratio calculations
 * (Issues #48, #61).
 */

import { describe, expect, it } from "vitest";

import { useBorrowMetrics } from "../useBorrowMetrics";

describe("useBorrowMetrics", () => {
  const baseProps = {
    collateralValueUsd: 10000,
    currentDebtUsd: 1000,
    liquidationThresholdBps: 8000,
    currentHealthFactor: 8.0,
  };

  it("shows current values when borrowAmount is 0", () => {
    const result = useBorrowMetrics({
      ...baseProps,
      borrowAmount: 0,
      tokenPriceUsd: 1,
    });

    expect(result.healthFactorValue).toBe(8.0);
    expect(result.borrowRatioOriginal).toBeUndefined();
    expect(result.healthFactorOriginal).toBeUndefined();
  });

  it("converts token units to USD using tokenPriceUsd for health factor", () => {
    // Borrow 100 tokens at $1 each = $100 additional debt
    // Total debt = $1000 + $100 = $1100
    // HF = (10000 * 0.8) / 1100 = 7.272...
    const result = useBorrowMetrics({
      ...baseProps,
      borrowAmount: 100,
      tokenPriceUsd: 1,
    });

    expect(result.healthFactorValue).toBeCloseTo((10000 * 0.8) / 1100, 5);
  });

  it("correctly handles non-$1 token prices", () => {
    // Borrow 4 tokens at $1500 each = $6000 additional debt
    // Total debt = $1000 + $6000 = $7000
    // HF = (10000 * 0.8) / 7000 = 1.142...
    const result = useBorrowMetrics({
      ...baseProps,
      borrowAmount: 4,
      tokenPriceUsd: 1500,
    });

    expect(result.healthFactorValue).toBeCloseTo((10000 * 0.8) / 7000, 5);
  });

  it("shows projected and original borrow ratio when borrowing", () => {
    const result = useBorrowMetrics({
      ...baseProps,
      borrowAmount: 500,
      tokenPriceUsd: 1,
    });

    // Original ratio should be based on current debt only
    expect(result.borrowRatioOriginal).toBeDefined();
    // Projected ratio should include the new borrow
    expect(result.borrowRatio).toBeDefined();
  });

  it("shows current values when tokenPriceUsd is null", () => {
    const result = useBorrowMetrics({
      ...baseProps,
      borrowAmount: 100,
      tokenPriceUsd: null,
    });

    // Should return current values with no projection, same as borrowAmount=0
    expect(result.healthFactorValue).toBe(8.0);
    expect(result.borrowRatioOriginal).toBeUndefined();
    expect(result.healthFactorOriginal).toBeUndefined();
  });

  it("returns Infinity health factor when no existing debt and borrowAmount is 0", () => {
    const result = useBorrowMetrics({
      ...baseProps,
      currentDebtUsd: 0,
      currentHealthFactor: null,
      borrowAmount: 0,
      tokenPriceUsd: 1,
    });

    expect(result.healthFactorValue).toBe(Infinity);
  });
});
