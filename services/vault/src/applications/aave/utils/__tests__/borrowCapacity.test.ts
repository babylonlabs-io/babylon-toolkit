import { describe, expect, it } from "vitest";

import {
  BORROW_CAPACITY_HEADROOM,
  BPS_SCALE,
  MIN_HEALTH_FACTOR_FOR_BORROW,
} from "../../constants";
import { calculateBorrowCapacityUsd } from "../borrowCapacity";

describe("calculateBorrowCapacityUsd", () => {
  it("subtracts current debt from the capacity implied by collateral and LT", () => {
    const result = calculateBorrowCapacityUsd({
      collateralValueUsd: 10000,
      currentDebtUsd: 2000,
      liquidationThresholdBps: 8000,
    });

    const expectedMaxTotalDebtUsd =
      ((10000 * 8000) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW) *
      (1 - BORROW_CAPACITY_HEADROOM);
    expect(result.availableToBorrowUsd).toBe(expectedMaxTotalDebtUsd - 2000);
  });

  it("clamps availableToBorrowUsd to 0 when debt exceeds capacity", () => {
    const result = calculateBorrowCapacityUsd({
      collateralValueUsd: 10000,
      currentDebtUsd: 100000,
      liquidationThresholdBps: 8000,
    });

    expect(result.availableToBorrowUsd).toBe(0);
  });

  it("leaves the projected health factor above the floor at full capacity", () => {
    const collateralValueUsd = 10000;
    const liquidationThresholdBps = 8000;

    const { availableToBorrowUsd } = calculateBorrowCapacityUsd({
      collateralValueUsd,
      currentDebtUsd: 0,
      liquidationThresholdBps,
    });

    // Borrowing the advertised maximum must not land exactly on the floor:
    // debt accrues between rendering "Max" and the pre-sign refetch, and
    // sizing to the rail made that refetch reject the borrow every time.
    const projectedHealthFactor =
      (collateralValueUsd * liquidationThresholdBps) /
      BPS_SCALE /
      availableToBorrowUsd;

    expect(projectedHealthFactor).toBeGreaterThan(MIN_HEALTH_FACTOR_FOR_BORROW);
  });

  it("returns zero capacity when collateral is zero", () => {
    const result = calculateBorrowCapacityUsd({
      collateralValueUsd: 0,
      currentDebtUsd: 0,
      liquidationThresholdBps: 8000,
    });

    expect(result.availableToBorrowUsd).toBe(0);
  });

  it("returns zero capacity when liquidation threshold is 0 (split params not loaded)", () => {
    const result = calculateBorrowCapacityUsd({
      collateralValueUsd: 10000,
      currentDebtUsd: 0,
      liquidationThresholdBps: 0,
    });

    expect(result.availableToBorrowUsd).toBe(0);
  });

  it("respects a different liquidation threshold (7500 BPS)", () => {
    const result = calculateBorrowCapacityUsd({
      collateralValueUsd: 10000,
      currentDebtUsd: 0,
      liquidationThresholdBps: 7500,
    });

    const expectedAvailableToBorrowUsd =
      ((10000 * 7500) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW) *
      (1 - BORROW_CAPACITY_HEADROOM);
    expect(result.availableToBorrowUsd).toBe(expectedAvailableToBorrowUsd);
  });
});
