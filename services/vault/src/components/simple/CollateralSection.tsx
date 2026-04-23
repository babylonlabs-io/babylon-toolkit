/**
 * CollateralSection Component
 * Displays collateral with an expandable view showing individual peg-in vaults.
 */

import { Avatar, Button, Card } from "@babylonlabs-io/core-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import type { Address } from "viem";
import { useAccount } from "wagmi";

import { WITHDRAW_HF_BLOCK_THRESHOLD } from "@/applications/aave/constants";
import {
  canWithdrawAnyVault,
  computeProjectedHealthFactor,
  getEffectiveVaultSelection,
  getWithdrawHfWarningState,
  isVaultIndividuallyWithdrawable,
  type PositionSnapshot,
} from "@/applications/aave/utils";
import { ArtifactDownloadModal } from "@/components/deposit/ArtifactDownloadModal";
import { DepositButton, ExpandMenuButton } from "@/components/shared";
import { Connect } from "@/components/Wallet";
import { getNetworkConfigBTC } from "@/config";
import type { ArtifactDownloadModalParams } from "@/hooks/deposit/useArtifactDownloadModal";
import { useVaultProviders } from "@/hooks/deposit/useVaultProviders";
import { logger } from "@/infrastructure";
import type { CollateralVaultEntry } from "@/types/collateral";
import { invalidateVaultQueries } from "@/utils/queryKeys";

import { CollateralExpandedContent } from "./CollateralExpandedContent";
import { ReorderSuccessModal, ReorderVaultsModal } from "./ReorderVaults";

const btcConfig = getNetworkConfigBTC();

interface CollateralSectionProps {
  totalAmountBtc: string;
  collateralVaults: CollateralVaultEntry[];
  hasCollateral: boolean;
  isConnected: boolean;
  collateralBtc: number;
  /** User's current on-chain health factor (null when no debt). */
  currentHealthFactor: number | null;
  /**
   * Selected vault IDs, owned by the parent so the withdraw dialog can read
   * them as its initial selection and reset them when it closes.
   */
  selectedVaultIds: string[];
  onSelectedVaultIdsChange: (selectedVaultIds: string[]) => void;
  onWithdraw: () => void;
  onDeposit: () => void;
}

const WITHDRAW_DISABLED_TOOLTIP =
  "No vault can be released without putting your position at risk of liquidation. Repay debt first.";

const WITHDRAW_HF_BREACH_TOOLTIP = `This selection would drop your health factor below ${WITHDRAW_HF_BLOCK_THRESHOLD.toFixed(1)} and be rejected on-chain. Reduce the selection or repay debt first.`;

export function CollateralSection({
  totalAmountBtc,
  collateralVaults,
  hasCollateral,
  isConnected,
  collateralBtc,
  currentHealthFactor,
  selectedVaultIds,
  onSelectedVaultIdsChange,
  onWithdraw,
  onDeposit,
}: CollateralSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [artifactParams, setArtifactParams] =
    useState<ArtifactDownloadModalParams | null>(null);
  const [isReorderOpen, setIsReorderOpen] = useState(false);
  const [isReorderSuccess, setIsReorderSuccess] = useState(false);
  const { findProvider } = useVaultProviders();
  const queryClient = useQueryClient();
  const { address } = useAccount();

  const position: PositionSnapshot = useMemo(
    () => ({ collateralBtc, currentHealthFactor }),
    [collateralBtc, currentHealthFactor],
  );

  // Per-vault eligibility: can this single vault be withdrawn alone without
  // breaching HF 1.0? Drives the per-row checkbox enabled state.
  const vaultEligibility = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const v of collateralVaults) {
      if (!v.inUse) continue;
      map.set(
        v.vaultId,
        isVaultIndividuallyWithdrawable(v.amountBtc, position),
      );
    }
    return map;
  }, [collateralVaults, position]);

  const { selectedVaultIds: effectiveSelectedVaultIds, selectedVaults } =
    useMemo(
      () => getEffectiveVaultSelection(collateralVaults, selectedVaultIds),
      [collateralVaults, selectedVaultIds],
    );

  const selectedBtc = useMemo(
    () => selectedVaults.reduce((sum, v) => sum + v.amountBtc, 0),
    [selectedVaults],
  );

  const projectedHealthFactor = useMemo(
    () =>
      computeProjectedHealthFactor(
        currentHealthFactor,
        collateralBtc,
        selectedBtc,
      ),
    [currentHealthFactor, collateralBtc, selectedBtc],
  );

  const { wouldBreachHF } = getWithdrawHfWarningState(projectedHealthFactor);

  const hasWithdrawableVault = useMemo(() => {
    if (!hasCollateral) return false;
    return canWithdrawAnyVault(collateralVaults, position);
  }, [hasCollateral, collateralVaults, position]);

  const canWithdraw =
    hasWithdrawableVault &&
    effectiveSelectedVaultIds.length > 0 &&
    !wouldBreachHF;

  const disabledReason = useMemo(() => {
    if (!hasWithdrawableVault) return WITHDRAW_DISABLED_TOOLTIP;
    if (wouldBreachHF && effectiveSelectedVaultIds.length > 0) {
      return WITHDRAW_HF_BREACH_TOOLTIP;
    }
    return undefined;
  }, [hasWithdrawableVault, wouldBreachHF, effectiveSelectedVaultIds.length]);

  const canReorder = collateralVaults.length >= 2;

  const handleToggleVaultSelect = useCallback(
    (vaultId: string) => {
      const next = selectedVaultIds.includes(vaultId)
        ? selectedVaultIds.filter((id) => id !== vaultId)
        : [...selectedVaultIds, vaultId];
      onSelectedVaultIdsChange(next);
    },
    [selectedVaultIds, onSelectedVaultIdsChange],
  );

  const handleReorderSuccessClose = useCallback(() => {
    setIsReorderSuccess(false);
    if (address) {
      queryClient.invalidateQueries({
        queryKey: ["vaultOrder", address.toLowerCase()],
      });
      invalidateVaultQueries(queryClient, address as Address);
    }
  }, [address, queryClient]);

  const handleArtifactDownload = useCallback(
    (vaultEntryId: string) => {
      const vault = collateralVaults.find((v) => v.id === vaultEntryId);
      if (!vault) return;

      const provider = findProvider(vault.providerAddress);
      if (!provider || !vault.depositorBtcPubkey || !vault.peginTxHash) {
        logger.warn(
          `[CollateralSection] Cannot download artifacts: missing provider, depositor public key, or peginTxHash for vault ${vaultEntryId}`,
        );
        return;
      }

      setArtifactParams({
        providerAddress: vault.providerAddress,
        peginTxid: vault.peginTxHash,
        depositorPk: vault.depositorBtcPubkey,
      });
    },
    [collateralVaults, findProvider],
  );

  return (
    <div className="w-full space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-normal text-accent-primary">
          Collateral
        </h2>
        <div className="flex items-center gap-2">
          {canReorder && (
            <Button
              variant="outlined"
              size="medium"
              onClick={() => setIsReorderOpen(true)}
              className="rounded-full"
            >
              Reorder
            </Button>
          )}
          <DepositButton
            variant="outlined"
            size="medium"
            onClick={() => onDeposit()}
            disabled={!isConnected}
            className="rounded-full"
          >
            Deposit
          </DepositButton>
        </div>
      </div>

      {hasCollateral ? (
        <Card variant="filled" className="w-full">
          {/* Summary row: BTC icon + total amount + three-dots toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar
                url={btcConfig.icon}
                alt={btcConfig.coinSymbol}
                size="small"
              />
              <span className="text-base text-accent-primary">
                {totalAmountBtc}
              </span>
            </div>
            <ExpandMenuButton
              isExpanded={isExpanded}
              onToggle={() => setIsExpanded((prev) => !prev)}
              aria-label="Vault options"
            />
          </div>

          {/* Expanded vault list */}
          {isExpanded && (
            <CollateralExpandedContent
              vaults={collateralVaults}
              vaultEligibility={vaultEligibility}
              selectedVaultIds={effectiveSelectedVaultIds}
              selectedBtc={selectedBtc}
              canWithdraw={canWithdraw}
              onToggleVaultSelect={handleToggleVaultSelect}
              onWithdraw={onWithdraw}
              disabledReason={disabledReason}
              onArtifactDownload={handleArtifactDownload}
            />
          )}
        </Card>
      ) : (
        <Card variant="filled" className="w-full">
          <div className="flex flex-col items-center justify-center gap-2 py-20">
            <Avatar
              url={btcConfig.icon}
              alt={btcConfig.coinSymbol}
              size="xlarge"
              className="mb-2 h-[100px] w-[100px]"
            />
            <p className="text-[20px] text-accent-primary">
              Deposit Bitcoin to get started
            </p>
            <p className="text-[16px] text-accent-secondary">
              Add {btcConfig.coinSymbol} as collateral so you can begin
              borrowing assets.
            </p>
            <div className="mt-8">
              {!isConnected ? (
                <Connect />
              ) : (
                <DepositButton
                  variant="outlined"
                  size="medium"
                  onClick={() => onDeposit()}
                  className="rounded-full"
                >
                  Deposit {btcConfig.coinSymbol}
                </DepositButton>
              )}
            </div>
          </div>
        </Card>
      )}

      {artifactParams && (
        <ArtifactDownloadModal
          open={!!artifactParams}
          onClose={() => setArtifactParams(null)}
          onComplete={() => setArtifactParams(null)}
          providerAddress={artifactParams.providerAddress}
          peginTxid={artifactParams.peginTxid}
          depositorPk={artifactParams.depositorPk}
        />
      )}

      <ReorderVaultsModal
        isOpen={isReorderOpen}
        onClose={() => setIsReorderOpen(false)}
        vaults={collateralVaults}
        onSuccess={() => setIsReorderSuccess(true)}
      />

      <ReorderSuccessModal
        isOpen={isReorderSuccess}
        onClose={handleReorderSuccessClose}
      />
    </div>
  );
}
