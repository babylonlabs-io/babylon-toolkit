/**
 * CollateralVaultItem Component
 * Renders a single vault card within the expanded collateral view.
 */

import { Avatar, Hint, Loader, StatusBadge } from "@babylonlabs-io/core-ui";

import { ExplorerLink } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import { COPY } from "@/copy";
import { truncateAddress } from "@/utils/addressUtils";
import {
  getVpExplorerProviderUrl,
  getVpExplorerVaultUrl,
} from "@/utils/explorer";
import { formatBtcAmount, formatOrdinal } from "@/utils/formatting";

import { PeginTxHashRow } from "./PeginTxHashRow";
import { VaultCardRow, VaultCardShell } from "./VaultCardShell";

const btcConfig = getNetworkConfigBTC();

interface CollateralVaultItemProps {
  vaultId: string;
  amountBtc: number;
  inUse: boolean;
  /**
   * Optimistic row shown right after the activation ETH tx, before the indexer
   * ingests the vault. Suppresses every action/field that needs indexed
   * metadata and shows an "Activating collateral…" status instead.
   */
  isActivating?: boolean;
  providerName: string;
  providerIconUrl?: string;
  /** Vault provider Ethereum address, shown on hover over the provider label */
  providerAddress: string;
  /** BTC peg-in transaction hash (hex, may include 0x prefix) */
  peginTxHash?: string;
  /** Pre-PegIn transaction hash (hex, may include 0x prefix) */
  prePeginTxHash?: string;
  liquidationIndex?: number;
  onArtifactDownload?: () => void;
}

export function CollateralVaultItem({
  vaultId,
  amountBtc,
  inUse,
  isActivating = false,
  providerName,
  providerIconUrl,
  providerAddress,
  peginTxHash,
  prePeginTxHash,
  liquidationIndex,
  onArtifactDownload,
}: CollateralVaultItemProps) {
  return (
    <VaultCardShell testId="vault-card">
      {/* Top row: BTC icon + amount */}
      <div className="flex items-center gap-2">
        <Avatar url={btcConfig.icon} alt={btcConfig.coinSymbol} size="medium" />
        <span className="text-xl font-medium text-accent-primary">
          {formatBtcAmount(amountBtc)}
        </span>
        {/* The vault explorer may 404 until the indexer ingests it. */}
        {!isActivating && (
          <ExplorerLink
            href={getVpExplorerVaultUrl(vaultId)}
            label={COPY.explorer.vaultLinkLabel}
          />
        )}
      </div>

      {/* Transaction hash row — Pegin + Pre-Pegin. The vault is active here, so
          both txs are on Bitcoin and link to the explorer. Hidden while
          activating: the indexed tx hashes aren't available yet. */}
      {!isActivating && (
        <PeginTxHashRow
          peginTxHash={peginTxHash}
          prePeginTxHash={prePeginTxHash}
          linkPegin
        />
      )}

      {/* Vault Provider row — hidden while activating: indexed provider
          metadata may be incomplete on the transient row. */}
      {!isActivating && (
        <VaultCardRow label="Vault provider">
          <span className="inline-flex items-center gap-1.5">
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
                    size="tiny"
                  />
                )}
                {providerName}
              </span>
            </Hint>
            <ExplorerLink
              href={getVpExplorerProviderUrl(providerAddress)}
              label={COPY.explorer.providerLinkLabel}
              size={14}
            />
          </span>
        </VaultCardRow>
      )}

      {/* Status row */}
      <VaultCardRow label="Status">
        {isActivating ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-accent-secondary">
            <Loader size={16} className="text-accent-secondary" />
            {COPY.collateral.activating}
          </span>
        ) : (
          <StatusBadge
            status={inUse ? "active" : "inactive"}
            label={
              inUse ? COPY.pegin.labels.IN_USE : COPY.pegin.labels.AVAILABLE
            }
          />
        )}
      </VaultCardRow>

      {/* Liquidation Order row — hidden while activating (no indexed order). */}
      {!isActivating && liquidationIndex !== undefined && (
        <VaultCardRow label="Liquidation Order">
          <span className="text-sm text-accent-primary">
            {formatOrdinal(liquidationIndex + 1)}
          </span>
        </VaultCardRow>
      )}

      {!isActivating && onArtifactDownload && (
        <div className="flex items-center justify-between rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-4">
          <span className="text-sm text-accent-primary">
            {COPY.collateral.artifactCallout.fileName}{" "}
            <span className="text-accent-secondary">
              {COPY.collateral.artifactCallout.recommended}
            </span>
          </span>
          <button
            type="button"
            onClick={onArtifactDownload}
            className="text-sm font-medium text-accent-primary hover:underline"
          >
            {COPY.collateral.artifactCallout.downloadNow}
          </button>
        </div>
      )}
    </VaultCardShell>
  );
}
