/**
 * Borrow pre-sign validation
 *
 * Runs immediately before submitting a borrow transaction. Two independent
 * on-chain checks plus a position refetch run in parallel before the wallet
 * sees the tx:
 *
 * 1. **Reserve-id anchor (auditor #230)**:
 *    `assertVbtcReserveAnchoredToAdapter` proves the displayed
 *    `btcVaultCoreVbtcReserveId` matches the env-pinned adapter's
 *    immutable and that the spoke reserve at that id has
 *    `underlying === VAULT_BTC`. A poisoned indexer would fail here —
 *    without it, a wrong reserve id flows through `refetchSplitParams`
 *    unnoticed because the CF-equality check below would compare two
 *    values for the same wrong reserve.
 * 2. **CF freshness (auditor #260)**: `assertCfUnchanged` refetches the
 *    risk parameters and asserts the freshly-fetched
 *    `liquidationThresholdBps` equals the one displayed on screen — React
 *    Query's query key does not change when CF is updated for the same
 *    `dynamicConfigKey`, so without this refetch a governance/operator
 *    update that lowered CF would let the user sign against an obsolete
 *    threshold.
 */
import type { Address } from "viem";

import { MIN_HEALTH_FACTOR_FOR_BORROW } from "../../../../constants";
import type { VaultSplitParams } from "../../../../hooks/useVaultSplitParams";
import type { AavePositionWithLiveData } from "../../../../services";
import { assertVbtcReserveAnchoredToAdapter } from "../../../../services/assertVbtcReserveAnchoredToAdapter";
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
  /** Env-pinned Aave adapter — the trust root for the reserve-id anchor. */
  adapterAddress: Address;
  /**
   * The vBTC reserve id the UI currently believes is correct
   * (`config.btcVaultCoreVbtcReserveId` from the indexer). Cross-checked
   * against the adapter's immutable.
   */
  displayedVbtcReserveId: bigint;
}

/**
 * Throws if it is not safe to proceed with the borrow:
 *  - token price unavailable
 *  - displayed reserve id doesn't match the adapter's immutable, or the
 *    spoke's reserve at that id doesn't point to VAULT_BTC
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
  adapterAddress,
  displayedVbtcReserveId,
}: ValidateBorrowPreSignDeps): Promise<void> {
  if (tokenPriceUsd == null) {
    throw new Error("Token price unavailable. Cannot validate borrow.");
  }

  // Three independent reads run in parallel for click-path latency. If any
  // throws (poisoned reserve id, CF moved, RPC error), the others' results
  // are discarded — at most a couple of wasted eth_calls in the failure
  // path, cheaper than serializing every borrow click.
  const [, { freshLiquidationThresholdBps }, freshPosition] = await Promise.all(
    [
      assertVbtcReserveAnchoredToAdapter(
        adapterAddress,
        displayedVbtcReserveId,
      ),
      assertCfUnchanged({ liquidationThresholdBps, refetchSplitParams }),
      refetchPosition(),
    ],
  );

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
