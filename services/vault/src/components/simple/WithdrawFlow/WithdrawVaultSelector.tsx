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
  /**
   * Map of vaultId → whether that vault can be withdrawn individually
   * without breaching HF 1.0. Vaults missing from the map or marked false
   * are rendered greyed out and are not selectable.
   */
  vaultEligibility: Map<string, boolean>;
  onNext: (selectedVaultIds: string[]) => void;
}

export function WithdrawVaultSelector({
  vaults,
  vaultEligibility,
  onNext,
}: WithdrawVaultSelectorProps) {
  const [selectedVaultIds, setSelectedVaultIds] = useState<string[]>([]);

  const inUseVaults = useMemo(() => vaults.filter((v) => v.inUse), [vaults]);

  const eligibleVaults = useMemo(
    () => inUseVaults.filter((v) => vaultEligibility.get(v.vaultId) === true),
    [inUseVaults, vaultEligibility],
  );

  const hasIneligibleVaults = eligibleVaults.length < inUseVaults.length;

  const allEligibleSelected =
    eligibleVaults.length > 0 &&
    eligibleVaults.every((v) => selectedVaultIds.includes(v.vaultId));

  const toggleSelection = (vaultId: string) => {
    if (vaultEligibility.get(vaultId) !== true) return;
    setSelectedVaultIds((prev) =>
      prev.includes(vaultId)
        ? prev.filter((id) => id !== vaultId)
        : [...prev, vaultId],
    );
  };

  const toggleAll = () => {
    if (allEligibleSelected) {
      setSelectedVaultIds([]);
    } else {
      setSelectedVaultIds(eligibleVaults.map((v) => v.vaultId));
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

      {hasIneligibleVaults && (
        <Text
          variant="body2"
          className="mt-2 text-warning-main"
          data-testid="withdraw-ineligible-hint"
        >
          Greyed-out vaults cannot be withdrawn without dropping your health
          factor below 1.0. Repay debt to unlock them.
        </Text>
      )}

      <div className="mt-6 flex flex-col">
        {/* Select all row */}
        {eligibleVaults.length > 1 && (
          <div
            className="flex cursor-pointer items-center justify-between border-b border-primary-light/20 px-4 py-3"
            onClick={toggleAll}
          >
            <Text variant="body2" className="font-medium text-accent-primary">
              Select All
            </Text>
            <div onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <Checkbox
                checked={allEligibleSelected}
                onChange={toggleAll}
                variant="default"
                showLabel={false}
              />
            </div>
          </div>
        )}

        {/* Vault list */}
        {inUseVaults.map((vault, index) => {
          const isEligible = vaultEligibility.get(vault.vaultId) === true;
          const isSelected = selectedVaultIds.includes(vault.vaultId);
          const rowBg =
            index % 2 === 0 ? "bg-secondary-highlight/50" : "bg-transparent";
          const hoverBg = isEligible
            ? index % 2 === 0
              ? "hover:bg-secondary-highlight"
              : "hover:bg-secondary-highlight/50"
            : "";
          const cursor = isEligible ? "cursor-pointer" : "cursor-not-allowed";
          const opacity = isEligible ? "" : "opacity-50";

          return (
            <div
              key={vault.id}
              className={`flex items-center justify-between gap-4 px-0 py-4 transition-colors ${rowBg} ${hoverBg} ${cursor} ${opacity}`}
              onClick={() => toggleSelection(vault.vaultId)}
              title={
                isEligible
                  ? undefined
                  : "Withdrawing this vault would drop your health factor below 1.0."
              }
              aria-disabled={!isEligible}
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
                  disabled={!isEligible}
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
