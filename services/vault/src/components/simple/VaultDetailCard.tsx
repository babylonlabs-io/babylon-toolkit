/**
 * VaultDetailCard Component
 *
 * Shared card layout for displaying vault details in pending sections.
 * Used by both PendingDepositCard and PendingWithdrawSection.
 */

import {
  Avatar,
  CheckIcon,
  CopyIcon,
  Hint,
  useCopy,
} from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { getNetworkConfigBTC } from "@/config";
import { truncateHash } from "@/utils/addressUtils";
import { formatBtcAmount, formatDateTime } from "@/utils/formatting";

const btcConfig = getNetworkConfigBTC();

function stripHexPrefix(hash: string): string {
  return hash.startsWith("0x") ? hash.slice(2) : hash;
}

interface VaultDetailCardProps {
  /** BTC amount (already converted from satoshis) */
  amountBtc: number;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Transaction hash (hex, may include 0x prefix) */
  txHash?: string;
  /** Vault provider display name */
  providerName: string;
  /** Vault provider icon URL */
  providerIconUrl?: string;
  /** Status content — rendered as the value in the Status row */
  statusContent: ReactNode;
  /** Optional action button rendered at the bottom */
  action?: ReactNode;
}

export function VaultDetailCard({
  amountBtc,
  timestamp,
  txHash,
  providerName,
  providerIconUrl,
  statusContent,
  action,
}: VaultDetailCardProps) {
  const { isCopied, copyToClipboard } = useCopy();

  return (
    <div className="space-y-3 rounded-xl border border-secondary-strokeLight p-4">
      {/* BTC icon + amount */}
      <div className="flex items-center gap-2">
        <Avatar url={btcConfig.icon} alt={btcConfig.coinSymbol} size="small" />
        <span className="text-base font-medium text-accent-primary">
          {formatBtcAmount(amountBtc)}
        </span>
      </div>

      {/* Date */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Date</span>
        <span className="text-sm text-accent-primary">
          {formatDateTime(new Date(timestamp))}
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Status</span>
        {statusContent}
      </div>

      {/* Vault Provider */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Vault Provider</span>
        <span className="flex items-center gap-1.5 text-sm text-accent-primary">
          {providerIconUrl && (
            <Avatar
              url={providerIconUrl}
              alt={providerName}
              size="small"
              className="h-4 w-4"
            />
          )}
          {providerName}
        </span>
      </div>

      {/* Transaction Hash */}
      {txHash && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-accent-secondary">
            Transaction Hash
          </span>
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
      )}

      {action}
    </div>
  );
}

/** Helper: renders a status dot + label + optional tooltip */
export function VaultStatusBadge({
  dotColor,
  label,
  tooltip,
}: {
  dotColor: string;
  label: string;
  tooltip?: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-accent-primary">
      <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
      {label}
      {tooltip && <Hint tooltip={tooltip} />}
    </span>
  );
}
