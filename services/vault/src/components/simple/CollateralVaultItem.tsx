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
import { truncateAddress } from "@/utils/addressUtils";
import { formatBtcAmount, formatOrdinal } from "@/utils/formatting";

const btcConfig = getNetworkConfigBTC();

interface CollateralVaultItemProps {
  vaultId: string;
  amountBtc: number;
  inUse: boolean;
  providerName: string;
  providerIconUrl?: string;
  /** Vault provider Ethereum address, shown on hover over the provider label */
  providerAddress: string;
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
    <div className="space-y-3 rounded-xl border border-secondary-strokeLight p-4">
      {/* Top row: BTC icon + amount + checkbox */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar
            url={btcConfig.icon}
            alt={btcConfig.coinSymbol}
            size="small"
          />
          <span className="text-base font-medium text-accent-primary">
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
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Status</span>
        <StatusBadge
          status={inUse ? "active" : "inactive"}
          label={inUse ? "In use" : "Available"}
        />
      </div>

      {/* Vault Provider row */}
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
              <Avatar url={providerIconUrl} alt={providerName} size="tiny" />
            )}
            {providerName}
          </span>
        </Hint>
      </div>

      {/* Liquidation Order row */}
      {liquidationIndex !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-accent-secondary">
            Liquidation Order
          </span>
          <span className="text-sm text-accent-primary">
            {formatOrdinal(liquidationIndex + 1)}
          </span>
        </div>
      )}

      {onArtifactDownload && (
        <Button
          variant="outlined"
          color="primary"
          className="w-full rounded-full"
          onClick={onArtifactDownload}
        >
          Download Artifacts
        </Button>
      )}
    </div>
  );
}
