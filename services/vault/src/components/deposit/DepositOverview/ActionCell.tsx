/**
 * Action Cell Component
 *
 * Renders action buttons or warning indicators for deposit table rows.
 */

import { Button } from "@babylonlabs-io/core-ui";

import type {
  ClaimerTransactions,
  DepositorGraphTransactions,
} from "../../../clients/vault-provider-rpc/types";
import { useDepositPollingResult } from "../../../context/deposit/PeginPollingContext";

import {
  getActionStatus,
  isArtifactDownloadAvailable,
  PeginAction,
} from "./actionStatus";
import { ActionWarningIndicator } from "./ActionWarningIndicator";

interface ActionCellProps {
  depositId: string;
  onSignClick: (
    depositId: string,
    transactions: ClaimerTransactions[],
    depositorGraph: DepositorGraphTransactions,
  ) => void;
  onBroadcastClick: (depositId: string) => void;
  onRedeemClick: (depositId: string) => void;
  onLamportKeyClick?: (depositId: string) => void;
  onArtifactDownloadClick?: (depositId: string) => void;
}

export function ActionCell({
  depositId,
  onSignClick,
  onBroadcastClick,
  onRedeemClick,
  onLamportKeyClick,
  onArtifactDownloadClick,
}: ActionCellProps) {
  const pollingResult = useDepositPollingResult(depositId);

  if (!pollingResult) return null;

  const { loading, transactions, depositorGraph } = pollingResult;
  const status = getActionStatus(pollingResult);
  const showArtifactDownload =
    onArtifactDownloadClick && isArtifactDownloadAvailable(pollingResult);

  if (status.type === "unavailable") {
    return <ActionWarningIndicator messages={status.reasons} />;
  }

  const { label, action } = status.action;

  const primaryButton = (() => {
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
            onClick={() => {
              if (transactions && depositorGraph) {
                onSignClick(depositId, transactions, depositorGraph);
              }
            }}
            disabled={loading || !transactions || !depositorGraph}
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
  })();

  if (!primaryButton) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {primaryButton}
      {showArtifactDownload && (
        <button
          type="button"
          onClick={() => onArtifactDownloadClick(depositId)}
          className="text-xs text-accent-secondary hover:text-accent-primary"
        >
          Download artifacts
        </button>
      )}
    </div>
  );
}
