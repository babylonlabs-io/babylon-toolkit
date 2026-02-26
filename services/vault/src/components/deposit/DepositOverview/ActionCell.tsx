/**
 * Action Cell Component
 *
 * Renders action buttons or warning indicators for deposit table rows.
 */

import { Button } from "@babylonlabs-io/core-ui";

import { useDepositPollingResult } from "../../../context/deposit/PeginPollingContext";

import { getActionStatus, PeginAction } from "./actionStatus";
import { ActionWarningIndicator } from "./ActionWarningIndicator";

interface ActionCellProps {
  depositId: string;
  onSignClick: (depositId: string, transactions: unknown[]) => void;
  onBroadcastClick: (depositId: string) => void;
  onRedeemClick: (depositId: string) => void;
  onLamportKeyClick?: (depositId: string) => void;
}

export function ActionCell({
  depositId,
  onSignClick,
  onBroadcastClick,
  onRedeemClick,
  onLamportKeyClick,
}: ActionCellProps) {
  const pollingResult = useDepositPollingResult(depositId);

  if (!pollingResult) return null;

  const { loading, transactions } = pollingResult;
  const status = getActionStatus(pollingResult);

  if (status.type === "unavailable") {
    return <ActionWarningIndicator messages={status.reasons} />;
  }

  const { label, action } = status.action;

  switch (action) {
    case PeginAction.SUBMIT_LAMPORT_KEY:
      return (
        <Button
          size="small"
          variant="contained"
          onClick={() => onLamportKeyClick?.(depositId)}
        >
          {label}
        </Button>
      );

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
