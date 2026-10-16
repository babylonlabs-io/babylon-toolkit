/**
 * Redeemed vaults that never became collateral.
 *
 * The registry redeems a vault for the depositor at activation when the
 * application's cap is exceeded or its `activateVault` reverts, through the
 * activate-and-redeem escape hatch, and through `claimExpiredVault`. The
 * indexer reports each of them REDEEMED, like an Aave withdrawal — but a
 * withdrawal keeps its collateral row and shows in Active Vaults as
 * `withdrawing` (`utils/collateral.ts`), while these have no row anywhere.
 * Inactive Vaults lists them until the vault output is spent and the indexer
 * reports them DEPOSITOR_WITHDRAWN, or NON_DEPOSITOR_SPEND when a vault keeper
 * claimed the BTC instead, where the reclaim row takes over.
 *
 * Every indexer-REDEEMED vault was redeemed for the vault provider's key and
 * the depositor's own. The keeper-only redeems, the two Aave liquidation
 * paths, end at LIQUIDATED instead: the indexer's `VaultClaimableBy` handler
 * skips a vault already liquidated (`babylon-vault-indexer`
 * `src/core/pegin.ts:333-339` @ be40130). So the row's copy — the vault
 * provider pays the BTC to the depositor's payout address — holds for each.
 */

import { ContractStatus } from "@/models/peginStateMachine";
import type { DepositOverride } from "@/overrides/deposits";
import type { VaultActivity } from "@/types/activity";

/**
 * @param collateralVaultIds - Lowercased ids of every vault with a collateral
 *   row, whatever its lifecycle, or `null` while the position has never
 *   loaded. Taken from the rows the page renders, cached data included, so a
 *   vault shown in Active Vaults is never duplicated here.
 */
export function selectReturnedRedeemedActivities(
  activities: VaultActivity[],
  collateralVaultIds: ReadonlySet<string> | null,
  demo: DepositOverride | null,
): VaultActivity[] {
  // Before the first position read a withdrawal has no row to exclude it, so
  // it would show here and then move to Active Vaults.
  if (collateralVaultIds === null) return [];
  // The demo override carries no redeemed rows; it can only hide the real ones.
  if (demo?.hideReal) return [];
  return activities.filter(
    (activity) =>
      activity.contractStatus === ContractStatus.REDEEMED &&
      !collateralVaultIds.has(activity.id.toLowerCase()),
  );
}
