/**
 * CollateralSection Component
 * Displays collateral with an expandable view showing individual peg-in vaults.
 */

import { Avatar, Card } from "@babylonlabs-io/core-ui";
import { useCallback, useState } from "react";

import { ArtifactDownloadModal } from "@/components/deposit/ArtifactDownloadModal";
import { DepositButton, ExpandMenuButton } from "@/components/shared";
import { Connect } from "@/components/Wallet";
import { getNetworkConfigBTC } from "@/config";
import type { ArtifactDownloadModalParams } from "@/hooks/deposit/useArtifactDownloadModal";
import { useVaultProviders } from "@/hooks/deposit/useVaultProviders";
import { logger } from "@/infrastructure";
import type { CollateralVaultEntry } from "@/types/collateral";

import { CollateralExpandedContent } from "./CollateralExpandedContent";

const btcConfig = getNetworkConfigBTC();

interface CollateralSectionProps {
  totalAmountBtc: string;
  collateralVaults: CollateralVaultEntry[];
  hasCollateral: boolean;
  isConnected: boolean;
  hasDebt: boolean;
  onWithdraw: () => void;
  onDeposit: () => void;
}

export function CollateralSection({
  totalAmountBtc,
  collateralVaults,
  hasCollateral,
  isConnected,
  hasDebt,
  onWithdraw,
  onDeposit,
}: CollateralSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [artifactParams, setArtifactParams] =
    useState<ArtifactDownloadModalParams | null>(null);
  const { findProvider } = useVaultProviders();
  const canWithdraw = !hasDebt;

  const handleArtifactDownload = useCallback(
    (vaultEntryId: string) => {
      const vault = collateralVaults.find((v) => v.id === vaultEntryId);
      if (!vault) return;

      const provider = findProvider(vault.providerAddress);
      if (!provider?.url || !vault.depositorBtcPubkey) {
        logger.warn(
          `[CollateralSection] Cannot download artifacts: missing provider URL or depositor public key for vault ${vaultEntryId}`,
        );
        return;
      }

      setArtifactParams({
        providerUrl: provider.url,
        peginTxid: vault.vaultId,
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
          <DepositButton
            variant="outlined"
            size="medium"
            onClick={onDeposit}
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
              onWithdraw={onWithdraw}
              canWithdraw={canWithdraw}
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
                  onClick={onDeposit}
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
          providerUrl={artifactParams.providerUrl}
          peginTxid={artifactParams.peginTxid}
          depositorPk={artifactParams.depositorPk}
        />
      )}
    </div>
  );
}
