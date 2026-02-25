/**
 * CollateralExpandedContent Component
 * Container for the scrollable vault list and withdraw button.
 */

import { Button } from "@babylonlabs-io/core-ui";

import type { CollateralVaultEntry } from "@/types/collateral";

import { CollateralVaultItem } from "./CollateralVaultItem";

interface CollateralExpandedContentProps {
  vaults: CollateralVaultEntry[];
  onWithdraw: () => void;
  canWithdraw: boolean;
}

export function CollateralExpandedContent({
  vaults,
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
          />
        ))}
      </div>

      {/* Withdraw button — withdraws ALL collateral (Aave constraint) */}
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
