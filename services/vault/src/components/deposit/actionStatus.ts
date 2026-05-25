/**
 * Action Status Utility
 *
 * Centralizes logic for determining if deposit actions are available
 * and what warnings to display.
 */

import { COPY } from "@/copy";

import type { DepositPollingResult } from "../../context/deposit/PeginPollingContext";
import {
  ContractStatus,
  getPrimaryActionButton,
  PeginAction,
} from "../../models/peginStateMachine";
import { getWalletOwnershipWarning } from "../../utils/vaultWarnings";

/**
 * Action button configuration from state machine.
 */
export interface ActionButton {
  label: string;
  action: PeginAction;
}

/**
 * Action status when actions are available.
 */
export interface ActionAvailable {
  type: "available";
  action: ActionButton;
}

/**
 * Action status when the would-be action is blocked by ownership mismatch.
 * The action button is still surfaced so the UI can render it disabled with
 * the tooltip explaining why.
 */
export interface ActionDisabled {
  type: "disabled";
  action: ActionButton;
  tooltip: string;
}

/**
 * Action status when no action should be rendered (no action exists for the
 * current state, or a polling error blocks it).
 */
export interface ActionUnavailable {
  type: "unavailable";
}

/**
 * Discriminated union for action status.
 */
export type ActionStatus = ActionAvailable | ActionDisabled | ActionUnavailable;

/**
 * Determine action availability for a deposit.
 *
 * Resolution order:
 * 1. No action exists for this state, or a polling error blocks it → unavailable
 * 2. Action exists but the vault was created with a different wallet → disabled
 *    (the would-be action is surfaced so the UI can render it dimmed + tooltip)
 * 3. Otherwise → available
 */
export function getActionStatus(
  pollingResult: DepositPollingResult,
): ActionStatus {
  const { peginState, isOwnedByCurrentWallet, error, depositorBtcPubkey } =
    pollingResult;

  const actionButton = getPrimaryActionButton(peginState);

  if (error || !actionButton) {
    return { type: "unavailable" };
  }

  // `isVaultOwnedByWallet` only returns false when both pubkeys are present
  // and differ, so `depositorBtcPubkey` is guaranteed defined here. The
  // explicit guard keeps TypeScript happy and stays defensive against future
  // changes to the ownership predicate.
  if (!isOwnedByCurrentWallet && depositorBtcPubkey) {
    return {
      type: "disabled",
      action: actionButton,
      tooltip: getWalletOwnershipWarning(depositorBtcPubkey),
    };
  }

  return { type: "available", action: actionButton };
}

/**
 * Check if artifact download is available for the current deposit state.
 */
export function isArtifactDownloadAvailable(
  pollingResult: DepositPollingResult,
): boolean {
  const { peginState, isOwnedByCurrentWallet, error } = pollingResult;
  if (error || !isOwnedByCurrentWallet) {
    return false;
  }
  return (
    peginState.contractStatus === ContractStatus.VERIFIED ||
    peginState.contractStatus === ContractStatus.ACTIVE
  );
}

const ACTION_REQUIRED_BADGE_PRIORITY: PeginAction[] = [
  PeginAction.ACTIVATE_VAULT,
  PeginAction.SIGN_PAYOUT_TRANSACTIONS,
  PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
  PeginAction.SUBMIT_WOTS_KEY,
  PeginAction.REFUND_HTLC,
];

const ACTION_REQUIRED_BADGE_LABELS: Record<PeginAction, string> = {
  [PeginAction.SUBMIT_WOTS_KEY]:
    COPY.pegin.actionRequiredBadges.SUBMIT_WOTS_KEY,
  [PeginAction.SIGN_PAYOUT_TRANSACTIONS]:
    COPY.pegin.actionRequiredBadges.SIGN_PAYOUT_TRANSACTIONS,
  [PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN]:
    COPY.pegin.actionRequiredBadges.SIGN_AND_BROADCAST_TO_BITCOIN,
  [PeginAction.ACTIVATE_VAULT]: COPY.pegin.actionRequiredBadges.ACTIVATE_VAULT,
  [PeginAction.REFUND_HTLC]: COPY.pegin.actionRequiredBadges.REFUND_HTLC,
  [PeginAction.NONE]: "",
};

export function getSectionActionRequiredLabel(
  results: (DepositPollingResult | undefined)[],
): string | null {
  let highestPriorityAction: PeginAction | null = null;
  for (const result of results) {
    if (!result) continue;
    const status = getActionStatus(result);
    if (status.type !== "available") continue;
    const action = status.action.action;
    const currentRank = ACTION_REQUIRED_BADGE_PRIORITY.indexOf(action);
    const existingRank =
      highestPriorityAction === null
        ? -1
        : ACTION_REQUIRED_BADGE_PRIORITY.indexOf(highestPriorityAction);
    if (currentRank >= 0 && (existingRank < 0 || currentRank < existingRank)) {
      highestPriorityAction = action;
    }
  }
  if (
    highestPriorityAction === null ||
    highestPriorityAction === PeginAction.NONE
  )
    return null;
  return ACTION_REQUIRED_BADGE_LABELS[highestPriorityAction] ?? null;
}

// Re-export PeginAction for convenience
export { PeginAction };
