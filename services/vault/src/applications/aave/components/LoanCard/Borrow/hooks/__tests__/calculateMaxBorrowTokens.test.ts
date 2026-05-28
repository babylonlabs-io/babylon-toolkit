import { describe, expect, it } from "vitest";

import {
  BPS_SCALE,
  MIN_HEALTH_FACTOR_FOR_BORROW,
} from "../../../../../constants";
import { calculateMaxBorrowTokens } from "../calculateMaxBorrowTokens";

describe("calculateMaxBorrowTokens", () => {
  it("caps max borrow using liquidation threshold and safety margin", () => {
    // $10,000 collateral, 80% LT, no existing debt, $1 token
    // (10000 * 8000 / 10000) / 1.2 = 6666.66...
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 10000,
      currentDebtUsd: 0,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 1,
      tokenDecimals: 6,
    });

    const expectedUsd =
      (10000 * 8000) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW;
    expect(result).toBe(Math.floor(expectedUsd * 1e6) / 1e6);
  });

  it("subtracts existing debt from borrowing capacity", () => {
    // $10,000 collateral, 80% LT, $2000 existing debt, $1 token
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 10000,
      currentDebtUsd: 2000,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 1,
      tokenDecimals: 6,
    });

    const expectedUsd =
      (10000 * 8000) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW - 2000;
    expect(result).toBe(Math.floor(expectedUsd * 1e6) / 1e6);
  });

  it("converts USD cap to token units when token price is not $1", () => {
    // $10,000 collateral, 80% LT, no debt, token worth $2
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 10000,
      currentDebtUsd: 0,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 2,
      tokenDecimals: 6,
    });

    const expectedUsd =
      (10000 * 8000) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW;
    expect(result).toBe(Math.floor((expectedUsd / 2) * 1e6) / 1e6);
  });

  it("returns zero when existing debt exceeds borrowing capacity", () => {
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 10000,
      currentDebtUsd: 8000,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 1,
      tokenDecimals: 6,
    });

    expect(result).toBe(0);
  });

  it("returns zero when collateral is zero", () => {
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 0,
      currentDebtUsd: 0,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 1,
      tokenDecimals: 6,
    });

    expect(result).toBe(0);
  });

  it("floors result to the token's native decimals", () => {
    // Choose inputs that would produce more than tokenDecimals if unrounded
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 123.456,
      currentDebtUsd: 0,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 1,
      tokenDecimals: 6,
    });

    expect(Number.isFinite(result)).toBe(true);
    expect(result * 1e6).toBe(Math.floor(result * 1e6));
  });

  it("returns zero when tokenPriceUsd is null", () => {
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 10000,
      currentDebtUsd: 0,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: null,
      tokenDecimals: 6,
    });

    expect(result).toBe(0);
  });

  it("returns zero when tokenPriceUsd is zero", () => {
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 10000,
      currentDebtUsd: 0,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 0,
      tokenDecimals: 6,
    });

    expect(result).toBe(0);
  });

  it("respects a different liquidation threshold (7500 BPS)", () => {
    // $10,000 collateral, 75% LT, no debt, $1 token
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 10000,
      currentDebtUsd: 0,
      liquidationThresholdBps: 7500,
      tokenPriceUsd: 1,
      tokenDecimals: 6,
    });

    const expectedUsd =
      (10000 * 7500) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW;
    expect(result).toBe(Math.floor(expectedUsd * 1e6) / 1e6);
  });

  it("preserves sub-cent precision for high-priced tokens (WBTC at ~$75k)", () => {
    // Small collateral, high token price — pre-fix this floored to 0.
    // $7.48 / $75000 ≈ 0.0000997 → must not round to 0 at 8 decimals.
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 8.976,
      currentDebtUsd: 0,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 75000,
      tokenDecimals: 8,
    });

    expect(result).toBeGreaterThan(0);
    expect(result * 1e8).toBe(Math.floor(result * 1e8));
  });

  it("caps floor precision at 15 decimals for 18-decimal tokens", () => {
    // 18-decimal token: floor must clamp at SAFE_TOFIXED_PRECISION (15) so the
    // displayed max never exposes precision the borrow execution path
    // (parseUnits(borrowAmount.toFixed(15), 18)) would silently truncate.
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 10000,
      currentDebtUsd: 0,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 1,
      tokenDecimals: 18,
    });

    // result * 10^15 must be an integer (floor cap)
    expect(result * 1e15).toBe(Math.floor(result * 1e15));
  });
});
