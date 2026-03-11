import {
  Avatar,
  AvatarGroup,
  Button,
  Checkbox,
  Heading,
  Text,
} from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";

import { getNetworkConfigBTC } from "@/config";
import type { CollateralVaultEntry } from "@/types/collateral";
import { formatBtcAmount } from "@/utils/formatting";

const btcConfig = getNetworkConfigBTC();

interface WithdrawVaultSelectorProps {
  vaults: CollateralVaultEntry[];
  onNext: (selectedVaultIds: string[]) => void;
}

export function WithdrawVaultSelector({
  vaults,
  onNext,
}: WithdrawVaultSelectorProps) {
  const [selectedVaultIds, setSelectedVaultIds] = useState<string[]>([]);

  const inUseVaults = useMemo(() => vaults.filter((v) => v.inUse), [vaults]);

  const allSelected =
    inUseVaults.length > 0 && selectedVaultIds.length === inUseVaults.length;

  const toggleSelection = (vaultId: string) => {
    setSelectedVaultIds((prev) =>
      prev.includes(vaultId)
        ? prev.filter((id) => id !== vaultId)
        : [...prev, vaultId],
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedVaultIds([]);
    } else {
      setSelectedVaultIds(inUseVaults.map((v) => v.vaultId));
    }
  };

  const handleNext = () => {
    if (selectedVaultIds.length > 0) {
      onNext(selectedVaultIds);
    }
  };

  return (
    <div className="w-full">
      <Heading variant="h5" className="text-accent-primary">
        Select Vaults to Withdraw
      </Heading>

      <Text variant="body2" className="mt-2 text-accent-secondary">
        Choose which vaults to withdraw from your collateral position.
      </Text>

      <div className="mt-6 flex flex-col">
        {/* Select all row */}
        {inUseVaults.length > 1 && (
          <div
            className="flex cursor-pointer items-center justify-between border-b border-primary-light/20 px-4 py-3"
            onClick={toggleAll}
          >
            <Text variant="body2" className="font-medium text-accent-primary">
              Select All
            </Text>
            <div onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <Checkbox
                checked={allSelected}
                onChange={toggleAll}
                variant="default"
                showLabel={false}
              />
            </div>
          </div>
        )}

        {/* Vault list */}
        {inUseVaults.map((vault, index) => {
          const isSelected = selectedVaultIds.includes(vault.vaultId);

          return (
            <div
              key={vault.id}
              className={`flex cursor-pointer items-center justify-between gap-4 px-0 py-4 transition-colors ${
                index % 2 === 0
                  ? "bg-secondary-highlight/50 hover:bg-secondary-highlight"
                  : "bg-transparent hover:bg-secondary-highlight/50"
              }`}
              onClick={() => toggleSelection(vault.vaultId)}
            >
              <div className="flex flex-1 items-center gap-3 px-4">
                <AvatarGroup size="medium">
                  <Avatar
                    url={btcConfig.icon}
                    alt={btcConfig.coinSymbol}
                    size="medium"
                    variant="circular"
                  />
                </AvatarGroup>
                <div className="flex flex-col">
                  <Text variant="body1" className="font-medium">
                    {formatBtcAmount(vault.amountBtc)} {btcConfig.coinSymbol}
                  </Text>
                  {vault.providerName && (
                    <Text variant="body2" className="text-accent-secondary">
                      {vault.providerName}
                    </Text>
                  )}
                </div>
              </div>
              <div onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                <Checkbox
                  checked={isSelected}
                  onChange={() => toggleSelection(vault.vaultId)}
                  variant="default"
                  showLabel={false}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <Button
          variant="contained"
          color="secondary"
          className="w-full"
          disabled={selectedVaultIds.length === 0}
          onClick={handleNext}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
