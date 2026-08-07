import {
  BORROW_CAPACITY_HEADROOM,
  BPS_SCALE,
  MIN_HEALTH_FACTOR_FOR_BORROW,
} from "../constants";

export interface BorrowCapacityUsdParams {
  collateralValueUsd: number;
  currentDebtUsd: number;
  liquidationThresholdBps: number;
}

export interface BorrowCapacityUsd {
  maxTotalDebtUsd: number;
  availableToBorrowUsd: number;
}

export function calculateBorrowCapacityUsd({
  collateralValueUsd,
  currentDebtUsd,
  liquidationThresholdBps,
}: BorrowCapacityUsdParams): BorrowCapacityUsd {
  // Held back from the rail so interest accrued between rendering "Max" and
  // the pre-sign refetch cannot push the projected health factor under the
  // floor and reject the borrow the user was just offered.
  const maxTotalDebtUsd =
    ((collateralValueUsd * liquidationThresholdBps) /
      BPS_SCALE /
      MIN_HEALTH_FACTOR_FOR_BORROW) *
    (1 - BORROW_CAPACITY_HEADROOM);
  return {
    maxTotalDebtUsd,
    availableToBorrowUsd: Math.max(0, maxTotalDebtUsd - currentDebtUsd),
  };
}
