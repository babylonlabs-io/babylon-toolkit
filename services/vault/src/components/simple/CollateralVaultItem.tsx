/**
 * CollateralVaultItem Component
 * Renders a single vault card within the expanded collateral view.
 */

import {
  Avatar,
  Button,
  Checkbox,
  Hint,
  Loader,
  StatusBadge,
} from "@babylonlabs-io/core-ui";

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
  selected: boolean;
  selectable: boolean;
  onToggleSelect: (vaultId: string) => void;
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
  selected,
  selectable,
  onToggleSelect,
  onArtifactDownload,
}: CollateralVaultItemProps) {
  const canInteract = (selectable || selected) && !isActivating;
  const handleToggle = () => {
    if (canInteract) onToggleSelect(vaultId);
  };

  return (
    <VaultCardShell testId="vault-card">
      {/* Top row: BTC icon + amount + checkbox */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar
            url={btcConfig.icon}
            alt={btcConfig.coinSymbol}
            size="medium"
          />
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
        <div onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          <Checkbox
            checked={selected}
            onChange={handleToggle}
            disabled={!canInteract}
            variant="default"
            showLabel={false}
          />
        </div>
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

      {/* Vault Provider row */}
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
                <Avatar url={providerIconUrl} alt={providerName} size="tiny" />
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
        <Button
          variant="outlined"
          color="secondary"
          className="w-full"
          onClick={onArtifactDownload}
        >
          Download Artifacts
        </Button>
      )}
    </VaultCardShell>
  );
}
