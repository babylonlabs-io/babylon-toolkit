/**
 * Repay pre-sign validation
 *
 * Runs immediately before submitting a repay transaction. Refetches the
 * on-chain risk parameters (CF / THF / LB) — the cached
 * `liquidationThresholdBps` powering the displayed post-repay HF projection
 * may be up to `CONFIG_STALE_TIME_MS` old, and React Query's query key does
 * not change when CF is updated for the same `dynamicConfigKey`. Without
 * this refetch a governance/operator update that lowered CF would let the
 * user sign a repay whose displayed risk-improvement projection ran against
 * an obsolete threshold (auditor finding #260).
 */
import type { VaultSplitParams } from "../../../../hooks/useVaultSplitParams";
import { assertCfUnchanged } from "../../../../utils";

export interface ValidateRepayPreSignDeps {
  /**
   * Liquidation threshold (in BPS) the user saw on the displayed metrics.
   * Compared against the freshly-fetched value to detect on-chain CF moves
   * since the screen was rendered.
   */
  liquidationThresholdBps: number;
  refetchSplitParams: () => Promise<VaultSplitParams | null>;
}

/**
 * Throws if it is not safe to proceed with the repay:
 *  - split params could not be refetched
 *  - on-chain CF moved since the screen was rendered
 */
export async function validateRepayPreSign({
  liquidationThresholdBps,
  refetchSplitParams,
}: ValidateRepayPreSignDeps): Promise<void> {
  await assertCfUnchanged({ liquidationThresholdBps, refetchSplitParams });
}
