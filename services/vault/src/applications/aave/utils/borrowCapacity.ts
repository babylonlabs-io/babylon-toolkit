import {
  BORROW_CAPACITY_HEADROOM,
  BPS_SCALE,
  HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
  MIN_HEALTH_FACTOR_FOR_BORROW,
} from "../constants";

export interface BorrowCapacityUsdParams {
  collateralValueUsd: number;
  currentDebtUsd: number;
  liquidationThresholdBps: number;
  safeMode?: boolean;
}

export interface BorrowCapacityUsd {
  availableToBorrowUsd: number;
}

export function calculateBorrowCapacityUsd({
  collateralValueUsd,
  currentDebtUsd,
  liquidationThresholdBps,
  safeMode = true,
}: BorrowCapacityUsdParams): BorrowCapacityUsd {
  // Held back from the rail so interest accrued between rendering "Max" and
  // the pre-sign refetch cannot push the projected health factor under the
  // floor and reject the borrow the user was just offered.
  const maxTotalDebtUsd =
    ((collateralValueUsd * liquidationThresholdBps) /
      BPS_SCALE /
      (safeMode
        ? MIN_HEALTH_FACTOR_FOR_BORROW
        : HEALTH_FACTOR_LIQUIDATION_THRESHOLD)) *
    (1 - BORROW_CAPACITY_HEADROOM);
  return {
    availableToBorrowUsd: Math.max(0, maxTotalDebtUsd - currentDebtUsd),
  };
}
