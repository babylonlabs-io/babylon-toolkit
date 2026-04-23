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
    });

    const expectedUsd =
      (10000 * 8000) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW;
    expect(result).toBe(Math.floor(expectedUsd * 100) / 100);
  });

  it("subtracts existing debt from borrowing capacity", () => {
    // $10,000 collateral, 80% LT, $2000 existing debt, $1 token
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 10000,
      currentDebtUsd: 2000,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 1,
    });

    const expectedUsd =
      (10000 * 8000) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW - 2000;
    expect(result).toBe(Math.floor(expectedUsd * 100) / 100);
  });

  it("converts USD cap to token units when token price is not $1", () => {
    // $10,000 collateral, 80% LT, no debt, token worth $2
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 10000,
      currentDebtUsd: 0,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 2,
    });

    const expectedUsd =
      (10000 * 8000) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW;
    expect(result).toBe(Math.floor((expectedUsd / 2) * 100) / 100);
  });

  it("returns zero when existing debt exceeds borrowing capacity", () => {
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 10000,
      currentDebtUsd: 8000,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 1,
    });

    expect(result).toBe(0);
  });

  it("returns zero when collateral is zero", () => {
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 0,
      currentDebtUsd: 0,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 1,
    });

    expect(result).toBe(0);
  });

  it("floors result to two decimal places", () => {
    // Choose inputs that would produce more than 2 decimals if unrounded
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 123.456,
      currentDebtUsd: 0,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 1,
    });

    // Must match Math.floor(value * 100) / 100 exactly
    expect(Number.isFinite(result)).toBe(true);
    expect(result * 100).toBe(Math.floor(result * 100));
  });

  it("returns zero when tokenPriceUsd is null", () => {
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 10000,
      currentDebtUsd: 0,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: null,
    });

    expect(result).toBe(0);
  });

  it("returns zero when tokenPriceUsd is zero", () => {
    const result = calculateMaxBorrowTokens({
      collateralValueUsd: 10000,
      currentDebtUsd: 0,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 0,
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
    });

    const expectedUsd =
      (10000 * 7500) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW;
    expect(result).toBe(Math.floor(expectedUsd * 100) / 100);
  });
});
