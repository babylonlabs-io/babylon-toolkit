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

import { VaultCardRow, VaultCardShell } from "./VaultCardShell";

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
  providerAddress,
  statusContent,
  action,
}: VaultDetailCardProps) {
  return (
    <VaultCardShell>
      {/* BTC icon + amount */}
      <div className="flex items-center gap-2">
        <Avatar url={btcConfig.icon} alt={btcConfig.coinSymbol} size="medium" />
        <span className="text-xl font-medium text-accent-primary">
          {formatBtcAmount(amountBtc)}
        </span>
      </div>

      {/* Date */}
      <VaultCardRow label="Date">
        <span className="text-sm text-accent-primary">
          {formatDateTime(new Date(timestamp))}
        </span>
      </VaultCardRow>

      {/* Status */}
      <VaultCardRow label="Status">{statusContent}</VaultCardRow>

      {/* Vault Provider */}
      <VaultCardRow label="Vault Provider">
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
      </VaultCardRow>

      {/* Transaction Hash (BTC pegin) */}
      {txHash && (
        <VaultCardRow label="Transaction Hash">
          <CopyableHash
            hash={txHash}
            chain="BTC"
            explorerUrl={getBtcExplorerTxUrl(txHash)}
          />
        </VaultCardRow>
      )}

      {action}
    </VaultCardShell>
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
