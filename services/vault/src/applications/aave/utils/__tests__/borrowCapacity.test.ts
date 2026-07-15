import { describe, expect, it } from "vitest";

import { BPS_SCALE, MIN_HEALTH_FACTOR_FOR_BORROW } from "../../constants";
import { calculateBorrowCapacityUsd } from "../borrowCapacity";

describe("calculateBorrowCapacityUsd", () => {
  it("computes max total debt and available borrow from collateral and LT", () => {
    const result = calculateBorrowCapacityUsd({
      collateralValueUsd: 10000,
      currentDebtUsd: 2000,
      liquidationThresholdBps: 8000,
    });

    const expectedMaxTotalDebtUsd =
      (10000 * 8000) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW;
    expect(result.maxTotalDebtUsd).toBe(expectedMaxTotalDebtUsd);
    expect(result.availableToBorrowUsd).toBe(expectedMaxTotalDebtUsd - 2000);
  });

  it("clamps availableToBorrowUsd to 0 when debt exceeds capacity", () => {
    const result = calculateBorrowCapacityUsd({
      collateralValueUsd: 10000,
      currentDebtUsd: 100000,
      liquidationThresholdBps: 8000,
    });

    const expectedMaxTotalDebtUsd =
      (10000 * 8000) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW;
    expect(result.maxTotalDebtUsd).toBe(expectedMaxTotalDebtUsd);
    expect(result.availableToBorrowUsd).toBe(0);
  });

  it("returns zero capacity when collateral is zero", () => {
    const result = calculateBorrowCapacityUsd({
      collateralValueUsd: 0,
      currentDebtUsd: 0,
      liquidationThresholdBps: 8000,
    });

    expect(result.maxTotalDebtUsd).toBe(0);
    expect(result.availableToBorrowUsd).toBe(0);
  });

  it("returns zero capacity when liquidation threshold is 0 (split params not loaded)", () => {
    const result = calculateBorrowCapacityUsd({
      collateralValueUsd: 10000,
      currentDebtUsd: 0,
      liquidationThresholdBps: 0,
    });

    expect(result.maxTotalDebtUsd).toBe(0);
    expect(result.availableToBorrowUsd).toBe(0);
  });

  it("respects a different liquidation threshold (7500 BPS)", () => {
    const result = calculateBorrowCapacityUsd({
      collateralValueUsd: 10000,
      currentDebtUsd: 0,
      liquidationThresholdBps: 7500,
    });

    const expectedMaxTotalDebtUsd =
      (10000 * 7500) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW;
    expect(result.maxTotalDebtUsd).toBe(expectedMaxTotalDebtUsd);
    expect(result.availableToBorrowUsd).toBe(expectedMaxTotalDebtUsd);
  });
});
