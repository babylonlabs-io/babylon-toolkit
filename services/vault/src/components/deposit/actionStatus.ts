/**
 * Action Status Utility
 *
 * Centralizes logic for determining if deposit actions are available
 * and what warnings to display.
 */

import type { DepositPollingResult } from "../../context/deposit/PeginPollingContext";
import {
  ContractStatus,
  getPrimaryActionButton,
  PeginAction,
} from "../../models/peginStateMachine";
import { WALLET_OWNERSHIP_WARNING } from "../../utils/vaultWarnings";

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
 * Action status when actions are unavailable.
 */
export interface ActionUnavailable {
  type: "unavailable";
  reasons: string[];
}

/**
 * Discriminated union for action status.
 */
export type ActionStatus = ActionAvailable | ActionUnavailable;

/**
 * Determine action availability and collect warning reasons.
 *
 * This centralizes the logic for checking:
 * - Wallet ownership
 * - Provider errors
 * - Action button availability
 *
 * @param pollingResult - The deposit polling result
 * @returns ActionStatus indicating if actions are available or reasons why not
 */
export function getActionStatus(
  pollingResult: DepositPollingResult,
): ActionStatus {
  const { peginState, isOwnedByCurrentWallet, error } = pollingResult;

  const reasons: string[] = [];

  // Collect all applicable warnings
  if (error) {
    reasons.push(error.message);
  }
  if (!isOwnedByCurrentWallet) {
    reasons.push(WALLET_OWNERSHIP_WARNING);
  }

  // If any blockers exist, action is unavailable
  if (reasons.length > 0) {
    return { type: "unavailable", reasons };
  }

  // Check if there's an action available for the current state
  const actionButton = getPrimaryActionButton(peginState);
  if (!actionButton) {
    return { type: "unavailable", reasons: [] };
  }

  return { type: "available", action: actionButton };
}

/**
 * Get warning messages from polling result.
 *
 * Use this when you need warnings but still want to show status
 * (e.g., mobile card shows both status badge and warnings).
 *
 * @param pollingResult - The deposit polling result
 * @returns Array of warning messages
 */
export function getWarningMessages(
  pollingResult: DepositPollingResult,
): string[] {
  const { isOwnedByCurrentWallet, error } = pollingResult;

  const messages: string[] = [];

  if (error) {
    messages.push(error.message);
  }
  if (!isOwnedByCurrentWallet) {
    messages.push(WALLET_OWNERSHIP_WARNING);
  }

  return messages;
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
  PeginAction.SUBMIT_LAMPORT_KEY,
  PeginAction.REFUND_HTLC,
];

const ACTION_REQUIRED_BADGE_LABELS: Record<PeginAction, string> = {
  [PeginAction.SUBMIT_LAMPORT_KEY]: "Key required",
  [PeginAction.SIGN_PAYOUT_TRANSACTIONS]: "Signing Required",
  [PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN]: "Broadcast required",
  [PeginAction.ACTIVATE_VAULT]: "Activation required",
  [PeginAction.REFUND_HTLC]: "Refund available",
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
