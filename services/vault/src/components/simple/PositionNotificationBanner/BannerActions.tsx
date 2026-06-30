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
  /** Freeze/Pause blocks `reorderVaults`; disables the "Apply Optimal Order" CTA. */
  reorderBlocked: boolean;
}

/**
 * Build the manual action pills for the position banner, fed to the core-ui
 * `Notification` `actions` slot:
 * - urgent: "Add Collateral" (primary, filled) + "Repay Debt" (secondary,
 *   outlined) — the core safety actions, matching the Figma callout.
 * - cliff with an affordable sacrificial size: "Add sacrificial vault" (generic
 *   label per Figma; the amount lives in the suggestion text) — opens the
 *   deposit flow with that amount pre-filled.
 * - rebalance with an actionable suggested vault size: "Add a X BTC vault" —
 *   opens the deposit flow with that amount pre-filled (a single, non-split
 *   supplemental deposit).
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
  reorderBlocked,
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

  // Add-vault CTA whenever a cliff/rebalance warning is present and the
  // calculator produced an actionable size — i.e. "add a sacrificial vault of
  // this exact size". When an urgent warning is primary it rides along as a
  // secondary action so the safety actions lead, but it is no longer dropped
  // (the warning's own suggestion text describes exactly this action). The
  // calculator guarantees the amount is positive and no larger than the position.
  // The cliff path uses the generic "Add sacrificial vault" label (amount in the
  // suggestion text per Figma); rebalance keeps the amount on the button.
  const hasCliffOrRebalanceWarning = result.warnings.some(
    (w) => w.type === "cliff" || w.type === "rebalance",
  );
  const isCliffSacrificial = result.suggestedNewVaultBtc !== null;
  const suggestedVaultBtc =
    result.suggestedNewVaultBtc ?? result.suggestedRebalanceVaultBtc;
  if (hasCliffOrRebalanceWarning && suggestedVaultBtc !== null) {
    const amountBtc = suggestedVaultBtc.toFixed(2);
    actions.push({
      label: isCliffSacrificial
        ? COPY.banner.addSacrificialVault
        : COPY.banner.addVault(amountBtc),
      onClick: () => onDeposit(amountBtc),
      emphasis: isUrgent ? "secondary" : "primary",
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
      // Disabled while a reorder is in flight, or when Freeze/Pause blocks
      // `reorderVaults` entirely (the protocol status banner explains why).
      disabled: isReordering || reorderBlocked,
    });
  }

  return actions;
}
