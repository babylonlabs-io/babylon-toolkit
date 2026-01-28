/**
 * Deposit Table Cell Components
 *
 * Reusable cell components for the deposits table.
 * These use the centralized polling context for state.
 */

import { Button, Hint, StatusBadge } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { useDepositPollingResult } from "../../../context/deposit/PeginPollingContext";
import {
  getPrimaryActionButton,
  PeginAction,
} from "../../../models/peginStateMachine";
import { truncateAddress } from "../../../utils/addressUtils";

/**
 * Card action format for VaultDetailCard component
 */
export interface CardAction {
  name: string;
  action: string;
}

/** Return type of getPrimaryActionButton */
type ActionButton = ReturnType<typeof getPrimaryActionButton>;

/**
 * Convert PeginAction to card actions format for VaultDetailCard
 */
export function getCardActions(
  actionButton: ActionButton,
): CardAction[] | undefined {
  if (!actionButton) return undefined;

  switch (actionButton.action) {
    case PeginAction.SIGN_PAYOUT_TRANSACTIONS:
      return [{ name: "Sign", action: "sign" }];
    case PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN:
      return [{ name: "Sign & Broadcast", action: "broadcast" }];
    case PeginAction.REDEEM:
      return [{ name: "Redeem", action: "redeem" }];
    default:
      return undefined;
  }
}

/**
 * Warning indicator for provider connectivity errors.
 * Shows a warning icon with tooltip when there's an error reaching the vault provider.
 */
export function ProviderErrorIndicator({ error }: { error: Error | null }) {
  if (!error) return null;

  return (
    <Hint
      tooltip="Unable to reach vault provider. The provider may be temporarily unavailable."
      attachToChildren
    >
      <span className="text-base text-warning-main" title="Provider error">
        ⚠
      </span>
    </Hint>
  );
}

/**
 * Status cell using centralized polling context
 *
 * Uses displayVariant from the state machine directly instead of
 * mapping from displayLabel strings.
 * Shows a warning indicator when there's a provider connectivity error.
 */
export function StatusCell({ depositId }: { depositId: string }) {
  const pollingResult = useDepositPollingResult(depositId);

  if (!pollingResult) return null;

  const { peginState, error } = pollingResult;

  // Build tooltip message, including error info if present
  const tooltipMessage = error
    ? `${peginState.message}\n\n⚠️ Provider connectivity issue: ${error.message}`
    : peginState.message;

  return (
    <div className="flex items-center gap-1.5">
      <Hint tooltip={tooltipMessage} attachToChildren>
        <StatusBadge
          status={peginState.displayVariant}
          label={peginState.displayLabel}
        />
      </Hint>
      <ProviderErrorIndicator error={error} />
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
  onRedeemClick,
}: {
  depositId: string;
  onSignClick: (depositId: string, transactions: any[]) => void;
  onBroadcastClick: (depositId: string) => void;
  onRedeemClick: (depositId: string) => void;
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
