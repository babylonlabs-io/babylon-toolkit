/**
 * VaultDetailCard Component
 *
 * Shared card layout for displaying vault details in pending sections.
 * Used by both PendingDepositCard and PendingWithdrawSection.
 */

import { Avatar, Hint, WarningIcon } from "@babylonlabs-io/core-ui";
import { useEffect, useState, type ReactNode } from "react";

import { ApplicationLogo } from "@/components/ApplicationLogo";
import { CopyableHash } from "@/components/shared/CopyableHash";
import { ExplorerLink } from "@/components/shared/ExplorerLink";
import { getNetworkConfigBTC } from "@/config";
import { COPY } from "@/copy";
import { truncateAddress } from "@/utils/addressUtils";
import {
  getBtcExplorerAddressUrl,
  getBtcExplorerTxUrl,
} from "@/utils/explorer";
import {
  formatBtcAmount,
  formatDateTime,
  formatTimeAgo,
} from "@/utils/formatting";

import { VaultCardRow, VaultCardShell } from "./VaultCardShell";

const btcConfig = getNetworkConfigBTC();

const RELATIVE_TIME_TICK_MS = 60_000;

function useRelativeTime(timestamp: number | undefined): string | null {
  const [label, setLabel] = useState(() =>
    timestamp === undefined ? null : formatTimeAgo(timestamp),
  );

  useEffect(() => {
    if (timestamp === undefined) {
      setLabel(null);
      return;
    }
    setLabel(formatTimeAgo(timestamp));
    const interval = setInterval(() => {
      setLabel(formatTimeAgo(timestamp));
    }, RELATIVE_TIME_TICK_MS);
    return () => clearInterval(interval);
  }, [timestamp]);

  return label;
}

interface VaultDetailCardProps {
  /** BTC amount (already converted from satoshis) */
  amountBtc: number;
  /** Timestamp in milliseconds. Omit to hide the "Created" row. */
  timestamp?: number;
  /** Single BTC transaction hash to link in the explorer (hex, may include 0x
   * prefix). Used by the withdraw section to show the vault's peg-in tx hash.
   * Ignored when `txHashRow` is provided. */
  txHash?: string;
  /** Custom transaction-hash row, rendered in place of the single-`txHash` row.
   * Deposit cards pass a dual Pegin / Pre-Pegin row here (see PeginTxHashRow). */
  txHashRow?: ReactNode;
  /** Vault provider display name */
  providerName: string;
  /** Vault provider icon URL */
  providerIconUrl?: string;
  /** Vault provider Ethereum address, shown on hover over the provider label */
  providerAddress: string;
  /** Pre-built explorer URL for this vault's page. Pass only when the vault is
   *  active/indexed (else it would 404); `undefined` renders no link. */
  vaultExplorerUrl?: string;
  /** Pre-built explorer URL for the vault provider's page; `undefined` renders
   *  no link. */
  providerExplorerUrl?: string;
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
  /** Dim the entire card to communicate that its action is blocked.
   *  Pair with `disabledTooltip` so hover explains why. */
  disabled?: boolean;
  /** Tooltip shown when hovering a `disabled` card. */
  disabledTooltip?: string;
  /** Decoded BTC address the pegout will land at. Rendered as the
   *  "Nominated Address" row when present. This is the address registered
   *  on-chain at vault creation, which may differ from the currently
   *  connected BTC wallet. */
  payoutBtcAddress?: string;
  /** Optional click handler invoked when the card body (not an inner button
   *  or link) is clicked. Used to open the deposit multistepper. */
  onClick?: () => void;
}

export function VaultDetailCard({
  amountBtc,
  timestamp,
  txHash,
  txHashRow,
  providerName,
  providerIconUrl,
  providerAddress,
  vaultExplorerUrl,
  providerExplorerUrl,
  statusContent,
  amountSubtext,
  headerEnd,
  belowHeader,
  action,
  disabled,
  disabledTooltip,
  payoutBtcAddress,
  onClick,
}: VaultDetailCardProps) {
  const relativeTime = useRelativeTime(timestamp);

  return (
    <VaultCardShell
      disabled={disabled}
      disabledTooltip={disabledTooltip}
      onClick={onClick}
    >
      {/* BTC icon + amount (+ optional subtext), optional header-end content */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Avatar
            url={btcConfig.icon}
            alt={btcConfig.coinSymbol}
            size="medium"
          />
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xl font-medium text-accent-primary">
                {formatBtcAmount(amountBtc)}
              </span>
              <ExplorerLink
                href={vaultExplorerUrl}
                label={COPY.explorer.vaultLinkLabel}
              />
            </div>
            {amountSubtext}
          </div>
        </div>
        {headerEnd}
      </div>

      {belowHeader}

      {/* Transaction Hash — leads the detail rows so users can verify the on-
          chain identity of the deposit at a glance. A custom row (e.g. dual
          Pegin / Pre-Pegin) takes precedence; otherwise fall back to the
          single-hash row. */}
      {txHashRow ??
        (txHash && (
          <VaultCardRow label={COPY.pegin.txHash.singleLabel}>
            <CopyableHash
              hash={txHash}
              chain="BTC"
              explorerUrl={getBtcExplorerTxUrl(txHash)}
            />
          </VaultCardRow>
        ))}

      {/* Vault Provider */}
      <VaultCardRow label="Vault provider">
        <span className="inline-flex items-center gap-1.5">
          <Hint
            tooltip={truncateAddress(providerAddress)}
            attachToChildren
            placement="left"
            className="text-sm text-accent-primary"
          >
            <span className="inline-flex items-center gap-1.5">
              <ApplicationLogo
                logoUrl={providerIconUrl ?? null}
                name={providerName}
                size="xs"
                shape="circle"
              />
              {providerName}
            </span>
          </Hint>
          <ExplorerLink
            href={providerExplorerUrl}
            label={COPY.explorer.providerLinkLabel}
            size={14}
          />
        </span>
      </VaultCardRow>

      {/* Date — hidden when no timestamp is supplied (e.g. cross-device rows). */}
      {timestamp !== undefined && (
        <VaultCardRow label="Date">
          <Hint
            tooltip={formatDateTime(new Date(timestamp))}
            attachToChildren
            placement="left"
            className="text-sm text-accent-primary"
          >
            <span>{relativeTime}</span>
          </Hint>
        </VaultCardRow>
      )}

      {/* Status */}
      {statusContent && (
        <VaultCardRow label="Status">{statusContent}</VaultCardRow>
      )}

      {/* Nominated Address — destination registered at vault creation.
          May differ from the currently connected BTC wallet. */}
      {payoutBtcAddress && (
        <VaultCardRow label="Nominated address">
          <CopyableHash
            hash={payoutBtcAddress}
            chain="BTC"
            kind="address"
            explorerUrl={getBtcExplorerAddressUrl(payoutBtcAddress)}
          />
        </VaultCardRow>
      )}

      {action}
    </VaultCardShell>
  );
}

/** Helper: renders a status dot (or danger icon) + label + optional tooltip */
export function VaultStatusBadge({
  dotColor,
  isDanger = false,
  label,
  tooltip,
}: {
  dotColor?: string;
  isDanger?: boolean;
  label: string;
  tooltip?: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-accent-primary">
      {isDanger ? (
        <WarningIcon size={14} variant="danger" />
      ) : (
        <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
      )}
      {label}
      {tooltip && <Hint tooltip={tooltip} />}
    </span>
  );
}
