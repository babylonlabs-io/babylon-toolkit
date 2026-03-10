/**
 * PendingDepositCard Component
 *
 * Renders a single pending deposit as a bordered sub-card within the
 * expanded summary card. Follows the CollateralVaultItem pattern:
 *  - BTC icon + amount
 *  - Date row
 *  - Status row with colored dot + label + info tooltip
 *  - Vault Provider row
 *  - Transaction Hash row
 *  - Action button
 */

import {
  Avatar,
  Button,
  CheckIcon,
  CopyIcon,
  Hint,
  useCopy,
} from "@babylonlabs-io/core-ui";

import type {
  ClaimerTransactions,
  DepositorGraphTransactions,
} from "@/clients/vault-provider-rpc/types";
import {
  getActionStatus,
  PeginAction,
} from "@/components/deposit/DepositOverview/actionStatus";
import { getNetworkConfigBTC } from "@/config";
import { useDepositPollingResult } from "@/context/deposit/PeginPollingContext";
import type { PeginState } from "@/models/peginStateMachine";
import type { VaultProvider } from "@/types/vaultProvider";
import { truncateAddress, truncateHash } from "@/utils/addressUtils";
import { formatBtcAmount, formatDateTime } from "@/utils/formatting";

const btcConfig = getNetworkConfigBTC();

type DisplayVariant = PeginState["displayVariant"];

const DOT_COLORS: Record<DisplayVariant, string> = {
  pending: "bg-warning-main",
  active: "bg-success-main",
  inactive: "bg-gray-400",
  warning: "bg-error-main",
};

interface PendingDepositCardProps {
  depositId: string;
  amount: string;
  /** Milliseconds since epoch */
  timestamp?: number;
  txHash: string;
  providerId: string;
  vaultProviders: VaultProvider[];
  onSignClick: (
    depositId: string,
    transactions: ClaimerTransactions[],
    depositorGraph: DepositorGraphTransactions,
  ) => void;
  onBroadcastClick: (depositId: string) => void;
  onLamportKeyClick: (depositId: string) => void;
}

function stripHexPrefix(hash: string): string {
  return hash.startsWith("0x") ? hash.slice(2) : hash;
}

export function PendingDepositCard({
  depositId,
  amount,
  timestamp,
  txHash,
  providerId,
  vaultProviders,
  onSignClick,
  onBroadcastClick,
  onLamportKeyClick,
}: PendingDepositCardProps) {
  const pollingResult = useDepositPollingResult(depositId);
  const { isCopied, copyToClipboard } = useCopy();

  if (!pollingResult) return null;

  const { loading, transactions, depositorGraph, peginState } = pollingResult;
  const status = getActionStatus(pollingResult);
  const isActionable = status.type === "available";

  const handleClick = () => {
    if (status.type !== "available") return;

    const { action } = status.action;
    if (action === PeginAction.SUBMIT_LAMPORT_KEY) {
      onLamportKeyClick(depositId);
    } else if (action === PeginAction.SIGN_PAYOUT_TRANSACTIONS) {
      if (transactions && depositorGraph) {
        onSignClick(depositId, transactions, depositorGraph);
      }
    } else if (action === PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN) {
      onBroadcastClick(depositId);
    }
  };

  const label =
    loading && !transactions ? "Loading..." : peginState.displayLabel;
  const buttonDisabled = !isActionable || (loading && !transactions);

  const formattedDate = timestamp ? formatDateTime(new Date(timestamp)) : "-";
  const btcAmount = parseFloat(amount || "0");
  const dotColor = DOT_COLORS[peginState.displayVariant];

  // Resolve provider name
  const provider = vaultProviders.find((vp) => vp.id === providerId);
  const providerName =
    provider?.name ?? `Provider ${truncateAddress(providerId)}`;

  return (
    <div className="space-y-3 rounded-xl border border-secondary-strokeLight p-4">
      {/* Top row: BTC icon + amount */}
      <div className="flex items-center gap-2">
        <Avatar url={btcConfig.icon} alt={btcConfig.coinSymbol} size="small" />
        <span className="text-base font-medium text-accent-primary">
          {formatBtcAmount(btcAmount)}
        </span>
      </div>

      {/* Date row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Date</span>
        <span className="text-sm text-accent-primary">{formattedDate}</span>
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Status</span>
        <span className="flex items-center gap-1.5 text-sm text-accent-primary">
          <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
          {peginState.displayLabel}
          {peginState.message && <Hint tooltip={peginState.message} />}
        </span>
      </div>

      {/* Vault Provider row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Vault Provider</span>
        <span className="flex items-center gap-1.5 text-sm text-accent-primary">
          {provider?.iconUrl && (
            <Avatar
              url={provider.iconUrl}
              alt={providerName}
              size="small"
              className="h-4 w-4"
            />
          )}
          {providerName}
        </span>
      </div>

      {/* Transaction Hash row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Transaction Hash</span>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1 font-mono text-sm text-accent-primary transition-colors hover:text-accent-secondary"
          onClick={() => {
            const hash = stripHexPrefix(txHash);
            copyToClipboard(txHash, hash);
          }}
          aria-label={`Copy transaction hash ${truncateHash(txHash)}`}
        >
          <span>{truncateHash(stripHexPrefix(txHash))}</span>
          {isCopied(txHash) ? (
            <CheckIcon size={14} variant="success" />
          ) : (
            <CopyIcon size={14} />
          )}
        </button>
      </div>

      {/* Action button — only shown when user action is required */}
      {isActionable && (
        <Button
          variant="outlined"
          color="primary"
          className="w-full rounded-full"
          disabled={buttonDisabled}
          onClick={handleClick}
        >
          {label}
        </Button>
      )}
    </div>
  );
}
