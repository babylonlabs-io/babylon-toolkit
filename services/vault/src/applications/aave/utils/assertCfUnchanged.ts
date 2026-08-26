/**
 * Verifies that the on-chain collateral factor (CF) backing the displayed
 * `liquidationThresholdBps` has not moved since the screen rendered. Used by
 * both `validateBorrowPreSign` and `validateRepayPreSign` so the freshness
 * check has one source of truth.
 *
 * Throws if the freshly fetched CF differs from the displayed value same `dynamicConfigKey`, different CF would otherwise stay
 * cached). Skips the equality check when `liquidationThresholdBps === 0` —
 * that's the loading/errored state where we never displayed a real value to
 * compare against, so claiming "Risk parameters have changed" would be
 * misleading.
 */
import { BPS_SCALE } from "../constants";
import type { VaultSplitParams } from "../hooks/useVaultSplitParams";

export interface AssertCfUnchangedDeps {
  /**
   * Liquidation threshold (in BPS) the user saw on the displayed metrics.
   * Zero means split params had not loaded — the equality check is skipped.
   */
  liquidationThresholdBps: number;
  refetchSplitParams: () => Promise<VaultSplitParams | null>;
}

export interface AssertCfUnchangedResult {
  freshSplitParams: VaultSplitParams;
  freshLiquidationThresholdBps: number;
}

export async function assertCfUnchanged({
  liquidationThresholdBps,
  refetchSplitParams,
}: AssertCfUnchangedDeps): Promise<AssertCfUnchangedResult> {
  const freshSplitParams = await refetchSplitParams();
  if (!freshSplitParams) {
    throw new Error(
      "Could not verify current risk parameters. Please try again.",
    );
  }
  const freshLiquidationThresholdBps = Math.round(
    freshSplitParams.CF * BPS_SCALE,
  );

  if (
    liquidationThresholdBps !== 0 &&
    freshLiquidationThresholdBps !== liquidationThresholdBps
  ) {
    throw new Error(
      "Risk parameters have changed. Please review the updated values and try again.",
    );
  }

  return { freshSplitParams, freshLiquidationThresholdBps };
}
