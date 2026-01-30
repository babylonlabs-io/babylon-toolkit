/**
 * Action Cell Component
 *
 * Renders action buttons or warning indicators for deposit table rows.
 */

import { Button } from "@babylonlabs-io/core-ui";

import { useDepositPollingResult } from "../../../context/deposit/PeginPollingContext";
import {
  getPrimaryActionButton,
  PeginAction,
} from "../../../models/peginStateMachine";
import { WALLET_OWNERSHIP_WARNING } from "../../../utils/walletOwnership";

import { ActionWarningIndicator } from "./ActionWarningIndicator";

interface ActionCellProps {
  depositId: string;
  onSignClick: (depositId: string, transactions: unknown[]) => void;
  onBroadcastClick: (depositId: string) => void;
  onRedeemClick: (depositId: string) => void;
}

/**
 * Build warning messages based on error and ownership state.
 */
function buildWarningMessages(
  error: Error | null,
  isOwnedByCurrentWallet: boolean,
): string[] {
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
 * Action cell for deposit table rows.
 * Shows action buttons when available, or warning indicators otherwise.
 */
export function ActionCell({
  depositId,
  onSignClick,
  onBroadcastClick,
  onRedeemClick,
}: ActionCellProps) {
  const pollingResult = useDepositPollingResult(depositId);

  if (!pollingResult) return null;

  const { peginState, loading, transactions, isOwnedByCurrentWallet, error } =
    pollingResult;
  const actionButton = getPrimaryActionButton(peginState);

  // Show warning indicator if vault not owned or no action available
  if (!isOwnedByCurrentWallet || !actionButton) {
    const messages = buildWarningMessages(error, isOwnedByCurrentWallet);
    return <ActionWarningIndicator messages={messages} />;
  }

  const { label, action } = actionButton;

  switch (action) {
    case PeginAction.SIGN_PAYOUT_TRANSACTIONS:
      return (
        <Button
          size="small"
          variant="contained"
          onClick={() => onSignClick(depositId, transactions || [])}
          disabled={loading || !transactions}
        >
          {loading ? "Loading..." : label}
        </Button>
      );

    case PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN:
      return (
        <Button
          size="small"
          variant="contained"
          onClick={() => onBroadcastClick(depositId)}
        >
          {label}
        </Button>
      );

    case PeginAction.REDEEM:
      return (
        <Button
          size="small"
          variant="contained"
          onClick={() => onRedeemClick(depositId)}
        >
          {label}
        </Button>
      );

    default:
      return null;
  }
}
