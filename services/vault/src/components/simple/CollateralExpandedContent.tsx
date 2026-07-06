/**
 * CollateralExpandedContent Component
 * Read-only, scrollable list of the individual peg-in vaults backing the
 * collateral. Withdraw selection lives in the Withdraw modal, not here.
 */

import type { CollateralVaultEntry } from "@/types/collateral";

import { CollateralVaultItem } from "./CollateralVaultItem";

interface CollateralExpandedContentProps {
  vaults: CollateralVaultEntry[];
  onArtifactDownload?: (vaultId: string) => void;
}

export function CollateralExpandedContent({
  vaults,
  onArtifactDownload,
}: CollateralExpandedContentProps) {
  return (
    <div className="mt-4 space-y-4">
      {/* Scrollable vault list - fits ~3 items then scrolls */}
      <div className="max-h-[320px] space-y-2 overflow-y-auto">
        {vaults.map((vault) => (
          <CollateralVaultItem
            key={vault.id}
            vaultId={vault.vaultId}
            amountBtc={vault.amountBtc}
            inUse={vault.inUse}
            isActivating={vault.isActivating}
            providerName={vault.providerName}
            providerIconUrl={vault.providerIconUrl}
            providerAddress={vault.providerAddress}
            peginTxHash={vault.peginTxHash}
            prePeginTxHash={vault.prePeginTxHash}
            liquidationIndex={vault.liquidationIndex}
            onArtifactDownload={
              onArtifactDownload
                ? () => onArtifactDownload(vault.id)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
