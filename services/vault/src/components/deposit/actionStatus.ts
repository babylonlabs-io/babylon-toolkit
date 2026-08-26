/**
 * Action Status Utility
 *
 * Centralizes logic for determining if deposit actions are available
 * and what warnings to display.
 */

import { COPY } from "@/copy";
import { isActivationFloorGating } from "@/utils/activationFloor";

import type { DepositPollingResult } from "../../context/deposit/PeginPollingContext";
import {
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
 * 3. Inside step 2: when the floor is why there is no action → disabled (with
 *    the wait explained) instead of noAction. Ownership (1) has already
 *    returned by then, so an unowned vault never advertises a countdown, and
 *    the `!error` guard keeps a polling failure reported as such.
 * 4. Otherwise → available.
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
    // A vault held by the activation floor has had ACTIVATE_VAULT stripped by
    // the state machine, so it lands here with no action. Surface it as a
    // disabled Activate with the wait explained, rather than the neutral
    // "View details" that `noAction` renders — otherwise the wait is silent
    // and looks like a stuck deposit.
    if (
      !error &&
      isActivationFloorGating(peginState.activationFloorBlocksRemaining)
    ) {
      return {
        type: "disabled",
        action: {
          label: COPY.pegin.primaryAction.ACTIVATE_VAULT,
          action: PeginAction.ACTIVATE_VAULT,
        },
        tooltip: COPY.pegin.messages.activationWindowTooltip,
      };
    }
    return { type: "noAction" };
  }

  return { type: "available", action: actionButton };
}

const ACTION_REQUIRED_BADGE_PRIORITY: PeginAction[] = [
  // The stuck-state recovery outranks everything: the deposit cannot progress
  // any other way once the peg-in was swept without activation.
  PeginAction.ACTIVATE_AND_REDEEM,
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
  [PeginAction.ACTIVATE_AND_REDEEM]:
    COPY.pegin.actionRequiredBadges.ACTIVATE_AND_REDEEM,
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
