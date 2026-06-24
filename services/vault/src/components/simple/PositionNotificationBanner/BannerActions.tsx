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
 * - suggested reorder available: "Apply Suggested Order" (secondary) — manual
 *   approve.
 *
 * Both groups can appear together (an urgent position whose order is also
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
  const showApplyOrder = suggestReorder && result.suggestedVaultOrder !== null;

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

  if (showApplyOrder) {
    actions.push({
      label: isReordering
        ? COPY.common.applying
        : COPY.banner.applySuggestedOrder,
      onClick: onApplyOrder,
      emphasis: "secondary",
      disabled: isReordering,
    });
  }

  return actions;
}
