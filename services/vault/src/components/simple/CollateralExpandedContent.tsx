/**
 * CollateralExpandedContent Component
 * Container for the scrollable vault list and withdraw button.
 */

import { Button, Text } from "@babylonlabs-io/core-ui";

import { formatBtcAmount } from "@/utils/formatting";
import type { CollateralVaultEntry } from "@/types/collateral";

import { CollateralVaultItem } from "./CollateralVaultItem";

interface CollateralExpandedContentProps {
  vaults: CollateralVaultEntry[];
  vaultEligibility: Map<string, boolean>;
  selectedVaultIds: string[];
  selectedBtc: number;
  canWithdraw: boolean;
  onToggleVaultSelect: (vaultId: string) => void;
  onWithdraw: () => void;
  /** Rendered as an inline helper below the Withdraw button when it is disabled. */
  disabledReason?: string;
  onArtifactDownload?: (vaultId: string) => void;
}

export function CollateralExpandedContent({
  vaults,
  vaultEligibility,
  selectedVaultIds,
  selectedBtc,
  canWithdraw,
  onToggleVaultSelect,
  onWithdraw,
  disabledReason,
  onArtifactDownload,
}: CollateralExpandedContentProps) {
  const hasSelection = selectedVaultIds.length > 0;
  const withdrawLabel = hasSelection
    ? `Withdraw ${formatBtcAmount(selectedBtc)}`
    : "Withdraw";

  return (
    <div className="mt-4 space-y-4">
      {/* Scrollable vault list - fits ~3 items then scrolls */}
      <div className="max-h-[320px] space-y-3 overflow-y-auto">
        {vaults.map((vault) => {
          const isSelected = selectedVaultIds.includes(vault.vaultId);
          const isEligible = vaultEligibility.get(vault.vaultId) === true;
          return (
            <CollateralVaultItem
              key={vault.id}
              vaultId={vault.vaultId}
              amountBtc={vault.amountBtc}
              inUse={vault.inUse}
              providerName={vault.providerName}
              providerIconUrl={vault.providerIconUrl}
              liquidationIndex={vault.liquidationIndex}
              selected={isSelected}
              selectable={vault.inUse && isEligible}
              onToggleSelect={onToggleVaultSelect}
              onArtifactDownload={
                onArtifactDownload
                  ? () => onArtifactDownload(vault.id)
                  : undefined
              }
            />
          );
        })}
      </div>

      <Button
        variant="contained"
        color="secondary"
        className="w-full rounded-full"
        onClick={onWithdraw}
        disabled={!canWithdraw || !hasSelection}
      >
        {withdrawLabel}
      </Button>
      {!canWithdraw && disabledReason && (
        <Text
          variant="body2"
          className="text-center text-accent-secondary"
          data-testid="withdraw-disabled-reason"
        >
          {disabledReason}
        </Text>
      )}
    </div>
  );
}
