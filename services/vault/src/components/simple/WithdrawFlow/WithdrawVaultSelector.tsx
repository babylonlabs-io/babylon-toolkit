import {
  Avatar,
  AvatarGroup,
  Button,
  Checkbox,
  Heading,
  Text,
} from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import {
  WITHDRAW_HF_BLOCK_THRESHOLD,
  WITHDRAW_HF_WARNING_THRESHOLD,
} from "@/applications/aave/constants";
import { getWithdrawHfWarningState } from "@/applications/aave/utils";
import { getNetworkConfigBTC } from "@/config";
import type { CollateralVaultEntry } from "@/types/collateral";
import { formatBtcAmount } from "@/utils/formatting";

import { HealthFactorDelta } from "./HealthFactorDelta";

const btcConfig = getNetworkConfigBTC();

interface WithdrawVaultSelectorProps {
  vaults: CollateralVaultEntry[];
  /**
   * Map of vaultId → whether that vault can be withdrawn individually
   * without breaching HF 1.0. Vaults missing from the map or marked false
   * are rendered greyed out and cannot be newly selected (already-selected
   * vaults can still be deselected even if their eligibility has flipped).
   */
  vaultEligibility: Map<string, boolean>;
  /** Selected vault IDs, owned by the parent so back-navigation preserves them. */
  selectedVaultIds: string[];
  onSelectionChange: (selectedVaultIds: string[]) => void;
  /** Current on-chain health factor, or null when the user has no debt. */
  currentHealthFactor: number | null;
  /** Projected health factor for the current selection; Infinity when no debt. */
  projectedHealthFactor: number;
  onNext: () => void;
}

export function WithdrawVaultSelector({
  vaults,
  vaultEligibility,
  selectedVaultIds,
  onSelectionChange,
  currentHealthFactor,
  projectedHealthFactor,
  onNext,
}: WithdrawVaultSelectorProps) {
  const inUseVaults = useMemo(() => vaults.filter((v) => v.inUse), [vaults]);

  const eligibleVaults = useMemo(
    () => inUseVaults.filter((v) => vaultEligibility.get(v.vaultId) === true),
    [inUseVaults, vaultEligibility],
  );

  const hasIneligibleVaults = eligibleVaults.length < inUseVaults.length;

  const allEligibleSelected =
    eligibleVaults.length > 0 &&
    eligibleVaults.every((v) => selectedVaultIds.includes(v.vaultId));

  // Would the combined selection breach HF 1.0? The contract would revert;
  // disable Next rather than let the user walk into a blocked review step.
  const { wouldBreachHF, isAtRisk } = getWithdrawHfWarningState(
    projectedHealthFactor,
  );

  const toggleSelection = (vaultId: string) => {
    const isCurrentlySelected = selectedVaultIds.includes(vaultId);
    // Block new selections of ineligible vaults, but always allow deselect
    // so a vault that flips to ineligible during a position refresh isn't
    // stuck in the selection.
    if (!isCurrentlySelected && vaultEligibility.get(vaultId) !== true) return;
    onSelectionChange(
      isCurrentlySelected
        ? selectedVaultIds.filter((id) => id !== vaultId)
        : [...selectedVaultIds, vaultId],
    );
  };

  const toggleAll = () => {
    if (allEligibleSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(eligibleVaults.map((v) => v.vaultId));
    }
  };

  const handleNext = () => {
    if (selectedVaultIds.length > 0 && !wouldBreachHF) {
      onNext();
    }
  };

  const showHfPreview =
    currentHealthFactor !== null && selectedVaultIds.length > 0;

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
          const canInteract = isEligible || isSelected;
          const rowBg =
            index % 2 === 0 ? "bg-secondary-highlight/50" : "bg-transparent";
          const hoverBg = canInteract
            ? index % 2 === 0
              ? "hover:bg-secondary-highlight"
              : "hover:bg-secondary-highlight/50"
            : "";
          const cursor = canInteract ? "cursor-pointer" : "cursor-not-allowed";
          const opacity = isEligible ? "" : "opacity-50";

          return (
            <div
              key={vault.id}
              className={`flex items-center justify-between gap-4 px-0 py-4 transition-colors ${rowBg} ${hoverBg} ${cursor} ${opacity}`}
              onClick={() => toggleSelection(vault.vaultId)}
              title={
                !isEligible && !isSelected
                  ? "Withdrawing this vault would drop your health factor below 1.0."
                  : undefined
              }
              aria-disabled={!canInteract}
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
                  disabled={!canInteract}
                />
              </div>
            </div>
          );
        })}
      </div>

      {showHfPreview && (
        <div
          className="mt-4 flex items-center justify-between"
          data-testid="withdraw-selector-hf-preview"
        >
          <Text variant="body2" className="text-accent-secondary">
            Projected Health Factor
          </Text>
          <Text variant="body2" className="text-accent-primary">
            <HealthFactorDelta
              current={currentHealthFactor}
              projected={projectedHealthFactor}
            />
          </Text>
        </div>
      )}
      {showHfPreview && wouldBreachHF && (
        <Text
          variant="body2"
          className="mt-2 text-error-main"
          data-testid="withdraw-selector-block-warning"
        >
          This selection would drop your health factor below{" "}
          {WITHDRAW_HF_BLOCK_THRESHOLD.toFixed(1)}. Deselect one or more vaults,
          or repay debt first.
        </Text>
      )}
      {showHfPreview && isAtRisk && (
        <Text
          variant="body2"
          className="mt-2 text-warning-main"
          data-testid="withdraw-selector-at-risk-warning"
        >
          This selection will put your position at risk of liquidation (health
          factor below {WITHDRAW_HF_WARNING_THRESHOLD.toFixed(1)}).
        </Text>
      )}

      <div className="mt-6">
        <Button
          variant="contained"
          color="secondary"
          className="w-full"
          disabled={selectedVaultIds.length === 0 || wouldBreachHF}
          onClick={handleNext}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
