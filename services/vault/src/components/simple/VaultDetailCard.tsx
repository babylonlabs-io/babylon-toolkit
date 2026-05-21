/**
 * VaultDetailCard Component
 *
 * Shared card layout for displaying vault details in pending sections.
 * Used by both PendingDepositCard and PendingWithdrawSection.
 */

import { Avatar, Hint } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { CopyableHash } from "@/components/shared/CopyableHash";
import { getNetworkConfigBTC } from "@/config";
import { truncateAddress } from "@/utils/addressUtils";
import { getBtcExplorerTxUrl } from "@/utils/explorer";
import { formatBtcAmount, formatDateTime } from "@/utils/formatting";

const btcConfig = getNetworkConfigBTC();

interface VaultDetailCardProps {
  /** BTC amount (already converted from satoshis) */
  amountBtc: number;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** BTC peg-in transaction hash (hex, may include 0x prefix) */
  txHash?: string;
  /** Vault provider display name */
  providerName: string;
  /** Vault provider icon URL */
  providerIconUrl?: string;
  /** Vault provider Ethereum address, shown on hover over the provider label */
  providerAddress: string;
  /** Status content — rendered as the value in the Status row. Omit to hide the
   * row entirely (e.g. when the status badge is rendered in the header). */
  statusContent?: ReactNode;
  /** Optional content rendered beneath the amount, in the same row as the icon
   * (e.g. a step indicator). */
  amountSubtext?: ReactNode;
  /** Optional content rendered at the right end of the amount/header row. */
  headerEnd?: ReactNode;
  /** Optional content rendered immediately below the amount/header row. */
  belowHeader?: ReactNode;
  /** Optional action button rendered at the bottom */
  action?: ReactNode;
}

export function VaultDetailCard({
  amountBtc,
  timestamp,
  txHash,
  providerName,
  providerIconUrl,
  providerAddress,
  statusContent,
  amountSubtext,
  headerEnd,
  belowHeader,
  action,
}: VaultDetailCardProps) {
  return (
    <div className="space-y-3 rounded-xl border border-secondary-strokeLight p-4">
      {/* BTC icon + amount (+ optional subtext), optional header-end content */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Avatar
            url={btcConfig.icon}
            alt={btcConfig.coinSymbol}
            size="small"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-medium text-accent-primary">
              {formatBtcAmount(amountBtc)}
            </span>
            {amountSubtext}
          </div>
        </div>
        {headerEnd}
      </div>

      {belowHeader}

      {/* Date */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Date</span>
        <span className="text-sm text-accent-primary">
          {formatDateTime(new Date(timestamp))}
        </span>
      </div>

      {/* Status */}
      {statusContent && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-accent-secondary">Status</span>
          {statusContent}
        </div>
      )}

      {/* Vault Provider */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Vault Provider</span>
        <Hint
          tooltip={truncateAddress(providerAddress)}
          attachToChildren
          placement="left"
          className="text-sm text-accent-primary"
        >
          <span className="inline-flex items-center gap-1.5">
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
        </Hint>
      </div>

      {/* Transaction Hash (BTC pegin) */}
      {txHash && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-accent-secondary">
            Transaction Hash
          </span>
          <CopyableHash
            hash={txHash}
            chain="BTC"
            explorerUrl={getBtcExplorerTxUrl(txHash)}
          />
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
