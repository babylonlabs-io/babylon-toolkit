/**
 * Refetches every signing input from chain at submit time: CF/THF/LB
 * (audit #260), account position, and the oracle price. Without the
 * fresh oracle read, the React Query cache was the only input that could
 * stay up to 60s stale through a price move.
 */
import type { Address } from "viem";

import { getReservesPrices } from "../../../../clients/aaveOracle";
import { MIN_HEALTH_FACTOR_FOR_BORROW } from "../../../../constants";
import type { VaultSplitParams } from "../../../../hooks/useVaultSplitParams";
import type { AavePositionWithLiveData } from "../../../../services";
import {
  aaveRayValueToUsd,
  aaveValueToUsd,
  assertCfUnchanged,
  calculateHealthFactor,
} from "../../../../utils";

/** Aave oracle base unit (Spoke.ORACLE_DECIMALS = 8). */
const ORACLE_SCALE = 1e8;

export interface ValidateBorrowPreSignDeps {
  borrowAmount: number;
  /** Aave on-chain oracle address (resolved upstream and cached). */
  oracleAddress: Address;
  /** Reserve ID of the borrow asset. */
  reserveId: bigint;
  /**
   * Liquidation threshold (in BPS) the user saw on the displayed metrics.
   * Compared against the freshly-fetched value to detect on-chain CF moves
   * since the screen was rendered.
   */
  liquidationThresholdBps: number;
  refetchSplitParams: () => Promise<VaultSplitParams | null>;
  refetchPosition: () => Promise<AavePositionWithLiveData | null>;
}

/** Throws if the projected post-borrow HF would fall below MIN_HEALTH_FACTOR_FOR_BORROW, or any input is stale/missing. */
export async function validateBorrowPreSign({
  borrowAmount,
  oracleAddress,
  reserveId,
  liquidationThresholdBps,
  refetchSplitParams,
  refetchPosition,
}: ValidateBorrowPreSignDeps): Promise<void> {
  // AaveOracle reverts on missing source or non-positive underlying price
  // (`InvalidSource` / `InvalidPrice`), so a returned value is always > 0.
  const [{ freshLiquidationThresholdBps }, freshPosition, freshPriceRaw] =
    await Promise.all([
      assertCfUnchanged({ liquidationThresholdBps, refetchSplitParams }),
      refetchPosition(),
      getReservesPrices(oracleAddress, [reserveId]).then(([raw]) => raw),
    ]);

  const freshTokenPriceUsd = Number(freshPriceRaw) / ORACLE_SCALE;

  if (!freshPosition) return; // No position = first borrow, skip revalidation

  const freshCollateralUsd = aaveValueToUsd(
    freshPosition.accountData.totalCollateralValue,
  );
  const freshDebtUsd = aaveRayValueToUsd(
    freshPosition.accountData.totalDebtValueRay,
  );
  const projectedDebtUsd = freshDebtUsd + borrowAmount * freshTokenPriceUsd;
  const projectedHF = calculateHealthFactor(
    freshCollateralUsd,
    projectedDebtUsd,
    freshLiquidationThresholdBps,
  );

  if (isFinite(projectedHF) && projectedHF < MIN_HEALTH_FACTOR_FOR_BORROW) {
    throw new Error(
      `Position data has changed. Projected health factor (${projectedHF.toFixed(2)}) ` +
        `would be below ${MIN_HEALTH_FACTOR_FOR_BORROW}. Please reduce the borrow amount.`,
    );
  }
}
