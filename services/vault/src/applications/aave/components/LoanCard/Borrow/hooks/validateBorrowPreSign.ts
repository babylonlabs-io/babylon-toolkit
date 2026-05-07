/**
 * Borrow pre-sign validation
 *
 * Runs immediately before submitting a borrow transaction. Refetches the
 * on-chain risk parameters (CF / THF / LB) and the user's position from the
 * contract — the cached values displayed in the UI may be up to
 * `CONFIG_STALE_TIME_MS` old, and React Query's query key does not change
 * when CF is updated for the same `dynamicConfigKey`. Without this refetch
 * a governance/operator update that lowered CF would let the user sign a
 * borrow whose UI safety check ran against an obsolete threshold (auditor
 * finding #260).
 */
import { MIN_HEALTH_FACTOR_FOR_BORROW } from "../../../../constants";
import type { VaultSplitParams } from "../../../../hooks/useVaultSplitParams";
import type { AavePositionWithLiveData } from "../../../../services";
import {
  aaveRayValueToUsd,
  aaveValueToUsd,
  assertCfUnchanged,
  calculateHealthFactor,
} from "../../../../utils";

export interface ValidateBorrowPreSignDeps {
  borrowAmount: number;
  tokenPriceUsd: number | null;
  /**
   * Liquidation threshold (in BPS) the user saw on the displayed metrics.
   * Compared against the freshly-fetched value to detect on-chain CF moves
   * since the screen was rendered.
   */
  liquidationThresholdBps: number;
  refetchSplitParams: () => Promise<VaultSplitParams | null>;
  refetchPosition: () => Promise<AavePositionWithLiveData | null>;
}

/**
 * Throws if it is not safe to proceed with the borrow:
 *  - token price unavailable
 *  - split params could not be refetched
 *  - on-chain CF moved since the screen was rendered
 *  - projected post-borrow HF would fall below `MIN_HEALTH_FACTOR_FOR_BORROW`
 */
export async function validateBorrowPreSign({
  borrowAmount,
  tokenPriceUsd,
  liquidationThresholdBps,
  refetchSplitParams,
  refetchPosition,
}: ValidateBorrowPreSignDeps): Promise<void> {
  if (tokenPriceUsd == null) {
    throw new Error("Token price unavailable. Cannot validate borrow.");
  }

  // The two refetches are independent contract reads. Parallelizing halves
  // the click-path latency. If `assertCfUnchanged` aborts, the in-flight
  // position refetch result is discarded — one wasted eth_call in the rare
  // CF-changed path is cheaper than serializing every borrow click.
  const [{ freshLiquidationThresholdBps }, freshPosition] = await Promise.all([
    assertCfUnchanged({ liquidationThresholdBps, refetchSplitParams }),
    refetchPosition(),
  ]);

  if (!freshPosition) return; // No position = first borrow, skip revalidation

  const freshCollateralUsd = aaveValueToUsd(
    freshPosition.accountData.totalCollateralValue,
  );
  const freshDebtUsd = aaveRayValueToUsd(
    freshPosition.accountData.totalDebtValueRay,
  );
  const projectedDebtUsd = freshDebtUsd + borrowAmount * tokenPriceUsd;
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
