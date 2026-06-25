import type { NotificationAction } from "@babylonlabs-io/core-ui";

import type {
  BannerState,
  CalculatorResult,
} from "@/applications/aave/positionNotifications";
import { COPY } from "@/copy";

interface BuildBannerActionsArgs {
  result: CalculatorResult;
  bannerState: BannerState;
  onDeposit: (initialAmountBtc?: string) => void;
  onRepay: () => void;
  onApplyOrder: () => void;
  isReordering: boolean;
}

/**
 * Build the manual action pills for the position banner, fed to the core-ui
 * `Notification` `actions` slot:
 * - urgent: "Add Collateral" (primary, filled) + "Repay Debt" (secondary,
 *   outlined) — the core safety actions, matching the Figma callout.
 * - cliff / rebalance with an actionable suggested vault size: "Add a X BTC
 *   vault" — opens the deposit flow with that amount pre-filled (a single,
 *   non-split supplemental deposit).
 * - optimal reorder available: "Apply Optimal Order" — filled (primary) on the
 *   standalone reorder card, secondary when it accompanies the urgent callout.
 *
 * The groups can appear together (an urgent position whose order is also
 * suboptimal).
 */
export function buildBannerActions({
  result,
  bannerState,
  onDeposit,
  onRepay,
  onApplyOrder,
  isReordering,
}: BuildBannerActionsArgs): NotificationAction[] {
  const { primaryWarning, suggestReorder } = bannerState;
  const isUrgent = primaryWarning?.type === "urgent";
  const showApplyOrder = suggestReorder && result.optimalVaultOrder !== null;

  const actions: NotificationAction[] = [];

  if (isUrgent) {
    actions.push(
      {
        label: COPY.banner.addCollateral,
        onClick: () => onDeposit(),
        emphasis: "primary",
      },
      {
        label: COPY.banner.repayDebt,
        onClick: onRepay,
        emphasis: "secondary",
      },
    );
  }

  // Add-vault CTA only when cliff/rebalance is the primary message — that is the
  // case whose call to action is "add a sacrificial vault of this exact size".
  // (Under an urgent primary the cliff is shown as a secondary note instead, so
  // the safety actions lead.) The calculator already guarantees the amount is
  // positive and no larger than the position.
  const isCliffOrRebalancePrimary =
    primaryWarning?.type === "cliff" || primaryWarning?.type === "rebalance";
  const suggestedVaultBtc =
    result.suggestedNewVaultBtc ?? result.suggestedRebalanceVaultBtc;
  if (isCliffOrRebalancePrimary && suggestedVaultBtc !== null) {
    const amountBtc = suggestedVaultBtc.toFixed(2);
    actions.push({
      label: COPY.banner.addVault(amountBtc),
      onClick: () => onDeposit(amountBtc),
      emphasis: "primary",
    });
  }

  if (showApplyOrder) {
    actions.push({
      label: isReordering
        ? COPY.common.applying
        : COPY.banner.applyOptimalOrder,
      // Standalone reorder gets the filled (primary) gold button; when it rides
      // alongside the urgent callout it stays secondary so "Add Collateral" leads.
      onClick: onApplyOrder,
      emphasis: isUrgent ? "secondary" : "primary",
      disabled: isReordering,
    });
  }

  return actions;
}
