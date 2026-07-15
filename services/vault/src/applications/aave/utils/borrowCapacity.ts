import { BPS_SCALE, MIN_HEALTH_FACTOR_FOR_BORROW } from "../constants";

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
  const maxTotalDebtUsd =
    (collateralValueUsd * liquidationThresholdBps) /
    BPS_SCALE /
    MIN_HEALTH_FACTOR_FOR_BORROW;
  return {
    maxTotalDebtUsd,
    availableToBorrowUsd: Math.max(0, maxTotalDebtUsd - currentDebtUsd),
  };
}
