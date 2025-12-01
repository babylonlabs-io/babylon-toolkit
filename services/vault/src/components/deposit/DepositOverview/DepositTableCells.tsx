/**
 * Deposit Table Cell Components
 *
 * Reusable cell components for the deposits table.
 * These use the centralized polling context for state.
 */

import { Button, StatusBadge } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { useDepositPollingResult } from "../../../context/deposit/PeginPollingContext";
import {
  getPrimaryActionButton,
  PeginAction,
} from "../../../models/peginStateMachine";
import { truncateAddress } from "../../../utils/addressUtils";

/**
 * Status cell using centralized polling context
 *
 * Uses displayVariant from the state machine directly instead of
 * mapping from displayLabel strings.
 */
export function StatusCell({ depositId }: { depositId: string }) {
  const pollingResult = useDepositPollingResult(depositId);

  if (!pollingResult) return null;

  const { peginState } = pollingResult;

  return (
    <div title={peginState.message || ""} className="cursor-help">
      <StatusBadge
        status={peginState.displayVariant}
        label={peginState.displayLabel}
      />
    </div>
  );
}

/**
 * Action cell using centralized polling context
 */
export function ActionCell({
  depositId,
  onSignClick,
  onBroadcastClick,
}: {
  depositId: string;
  onSignClick: (depositId: string, transactions: any[]) => void;
  onBroadcastClick: (depositId: string) => void;
}) {
  const pollingResult = useDepositPollingResult(depositId);

  if (!pollingResult) return null;

  const { peginState, loading, transactions } = pollingResult;
  const actionButton = getPrimaryActionButton(peginState);

  if (!actionButton) return null;

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
      return null;

    default:
      return null;
  }
}

/**
 * Copyable address cell with click-to-copy functionality
 */
export function CopyableAddressCell({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 text-sm text-accent-primary transition-colors hover:text-accent-secondary"
      title={copied ? "Copied!" : "Click to copy address"}
    >
      <span>{truncateAddress(address)}</span>
      {copied && <span className="text-xs text-green-500">✓</span>}
    </button>
  );
}
