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
 * Action status when the vault is owned by a different wallet. `action` is
 * present for states with a primary action (Sign, Broadcast, Refund, …) so
 * the button can render dimmed; absent for pure-progress states (e.g.
 * "awaiting BTC confirmation") — the card still dims and the tooltip still
 * fires so unowned cards are always visually distinct.
 */
export interface ActionDisabled {
  type: "disabled";
  action?: ActionButton;
  tooltip: string;
}

/**
 * Action status when there's nothing for the user to do — either the state
 * has no current primary action (happy waiting path) or a polling error
 * blocks it. Consumers render no button and don't dim the card.
 */
export interface ActionNoAction {
  type: "noAction";
}

/**
 * Discriminated union for action status.
 */
export type ActionStatus = ActionAvailable | ActionDisabled | ActionNoAction;

/**
 * Determine action availability for a deposit.
 *
 * Resolution order:
 * 1. Vault created with a different wallet → disabled (dimmed + tooltip).
 *    Surfaces the would-be action when one exists; otherwise the card
 *    itself still dims so unowned cards are always visually distinct,
 *    even on polling error or in pure-waiting states.
 * 2. Polling error, or no action for this state → noAction.
 * 3. Otherwise → available.
 */
export function getActionStatus(
  pollingResult: DepositPollingResult,
): ActionStatus {
  const { peginState, isOwnedByCurrentWallet, error, depositorBtcPubkey } =
    pollingResult;

  // Ownership runs FIRST. It's derived from activity/indexer state, not
  // from polling — and "this isn't your vault" is a stronger UI signal
  // than "polling failed" or "no action right now", so unowned vaults
  // dim + show the wallet-switch tooltip regardless of polling state.
  // `isVaultOwnedByWallet` only returns false when both pubkeys are
  // present and differ, so `depositorBtcPubkey` is guaranteed defined.
  const actionButton = getPrimaryActionButton(peginState);
  if (!isOwnedByCurrentWallet && depositorBtcPubkey) {
    return {
      type: "disabled",
      action: actionButton ?? undefined,
      tooltip: getWalletOwnershipWarning(depositorBtcPubkey),
    };
  }

  if (error || !actionButton) {
    return { type: "noAction" };
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
