/**
 * Action Status Utility
 *
 * Centralizes logic for determining if deposit actions are available
 * and what warnings to display.
 */

import type { DepositPollingResult } from "../../../context/deposit/PeginPollingContext";
import {
  getPrimaryActionButton,
  PeginAction,
} from "../../../models/peginStateMachine";
import {
  UTXO_UNAVAILABLE_WARNING,
  WALLET_OWNERSHIP_WARNING,
} from "../../../utils/vaultWarnings";

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
 * - UTXO availability
 * - Provider errors
 * - Action button availability
 *
 * @param pollingResult - The deposit polling result
 * @returns ActionStatus indicating if actions are available or reasons why not
 */
export function getActionStatus(
  pollingResult: DepositPollingResult,
): ActionStatus {
  const { peginState, isOwnedByCurrentWallet, utxoUnavailable, error } =
    pollingResult;

  const reasons: string[] = [];

  // Collect all applicable warnings
  if (error) {
    reasons.push(error.message);
  }
  if (!isOwnedByCurrentWallet) {
    reasons.push(WALLET_OWNERSHIP_WARNING);
  }
  if (utxoUnavailable) {
    reasons.push(UTXO_UNAVAILABLE_WARNING);
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
  const { isOwnedByCurrentWallet, utxoUnavailable, error } = pollingResult;

  const messages: string[] = [];

  if (error) {
    messages.push(error.message);
  }
  if (!isOwnedByCurrentWallet) {
    messages.push(WALLET_OWNERSHIP_WARNING);
  }
  if (utxoUnavailable) {
    messages.push(UTXO_UNAVAILABLE_WARNING);
  }

  return messages;
}

/**
 * Check if deposit row should be disabled (for table styling).
 *
 * @param pollingResult - The deposit polling result
 * @returns true if the row should appear disabled
 */
export function isDepositDisabled(
  pollingResult: DepositPollingResult,
): boolean {
  return !pollingResult.isOwnedByCurrentWallet || pollingResult.utxoUnavailable;
}

// Re-export PeginAction for convenience
export { PeginAction };
