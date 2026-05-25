/**
 * CollateralVaultItem Component
 * Renders a single vault card within the expanded collateral view.
 */

import {
  Avatar,
  Button,
  Checkbox,
  Hint,
  StatusBadge,
} from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";
import { COPY } from "@/copy";
import { truncateAddress } from "@/utils/addressUtils";
import { formatBtcAmount, formatOrdinal } from "@/utils/formatting";

import { PeginTxHashRow } from "./PeginTxHashRow";
import { VaultCardRow, VaultCardShell } from "./VaultCardShell";

const btcConfig = getNetworkConfigBTC();

interface CollateralVaultItemProps {
  vaultId: string;
  amountBtc: number;
  inUse: boolean;
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
  const canInteract = selectable || selected;
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

      {/* Status row */}
      <VaultCardRow label="Status">
        <StatusBadge
          status={inUse ? "active" : "inactive"}
          label={inUse ? COPY.pegin.labels.IN_USE : COPY.pegin.labels.AVAILABLE}
        />
      </VaultCardRow>

      {/* Vault Provider row */}
      <VaultCardRow label="Vault Provider">
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
      </VaultCardRow>

      {/* Transaction hash row — Pegin + Pre-Pegin. The vault is active here, so
          both txs are on Bitcoin and link to the explorer. */}
      <PeginTxHashRow
        peginTxHash={peginTxHash}
        prePeginTxHash={prePeginTxHash}
        linkPegin
      />

      {/* Liquidation Order row */}
      {liquidationIndex !== undefined && (
        <VaultCardRow label="Liquidation Order">
          <span className="text-sm text-accent-primary">
            {formatOrdinal(liquidationIndex + 1)}
          </span>
        </VaultCardRow>
      )}

      {onArtifactDownload && (
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
