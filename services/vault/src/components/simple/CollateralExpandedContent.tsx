/**
 * CollateralExpandedContent Component
 * Container for the scrollable vault list and withdraw button.
 */

import { Button } from "@babylonlabs-io/core-ui";

import type { CollateralVaultEntry } from "@/types/collateral";

import { CollateralVaultItem } from "./CollateralVaultItem";

interface CollateralExpandedContentProps {
  vaults: CollateralVaultEntry[];
  selectedVaultIds: Set<string>;
  onToggleVault: (vaultId: string) => void;
  onWithdraw: () => void;
  canWithdraw: boolean;
}

export function CollateralExpandedContent({
  vaults,
  selectedVaultIds,
  onToggleVault,
  onWithdraw,
  canWithdraw,
}: CollateralExpandedContentProps) {
  return (
    <div className="mt-4 space-y-4">
      {/* Scrollable vault list - fits ~3 items then scrolls */}
      <div className="max-h-[320px] space-y-3 overflow-y-auto">
        {vaults.map((vault) => (
          <CollateralVaultItem
            key={vault.id}
            vaultId={vault.vaultId}
            amountBtc={vault.amountBtc}
            addedAt={vault.addedAt}
            selected={selectedVaultIds.has(vault.vaultId)}
            onToggle={onToggleVault}
          />
        ))}
      </div>

      {/* Withdraw button */}
      <Button
        variant="outlined"
        color="primary"
        className="w-full rounded-full"
        onClick={onWithdraw}
        disabled={!canWithdraw}
      >
        Withdraw
      </Button>
    </div>
  );
}
