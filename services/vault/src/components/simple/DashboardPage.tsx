/**
 * DashboardPage Component
 * Composes all dashboard sections into the main dashboard view.
 * Wires real data from Aave hooks and navigation to deposit/borrow/repay flows.
 */

import { Container } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";

import { AssetSelectionModal } from "@/applications/aave/components/AssetSelectionModal";
import { LOAN_TAB, type LoanTab } from "@/applications/aave/constants";
import {
  usePendingVaults,
  useSyncPendingVaults,
} from "@/applications/aave/context";
import { useAaveConfig } from "@/applications/aave/context/AaveConfigContext";
import { useAaveVaults } from "@/applications/aave/hooks";
import type { Asset } from "@/applications/aave/types";
import type { RootLayoutContext } from "@/components/pages/RootLayout";
import { useConnection, useETHWallet } from "@/context/wallet";
import { useVaultProviders } from "@/hooks/deposit/useVaultProviders";
import { useDashboardState } from "@/hooks/useDashboardState";
import { formatBtcAmount, formatUsdValue } from "@/utils/formatting";

import { CollateralSection } from "./CollateralSection";
import { LoansSection } from "./LoansSection";
import { OverviewSection } from "./OverviewSection";
import { PendingDepositSection } from "./PendingDepositSection";
import {
  PendingWithdrawSection,
  type PendingWithdrawVault,
} from "./PendingWithdrawSection";
import WithdrawFlow from "./WithdrawFlow";

export function DashboardPage() {
  const navigate = useNavigate();
  const { openDeposit } = useOutletContext<RootLayoutContext>();
  const { address } = useETHWallet();
  const { isConnected } = useConnection();
  const { config } = useAaveConfig();
  const { vaultProviders } = useVaultProviders(config?.controllerAddress);

  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [assetModalMode, setAssetModalMode] = useState<LoanTab>(
    LOAN_TAB.BORROW,
  );

  const {
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    healthFactorStatus,
    borrowedAssets,
    hasLoans,
    hasCollateral,
    hasDebt,
    collateralVaults,
    selectableBorrowedAssets,
  } = useDashboardState(address, vaultProviders);

  const { vaults: aaveVaults } = useAaveVaults(address);
  const { hasPendingWithdraw, pendingVaults } = usePendingVaults();
  useSyncPendingVaults(aaveVaults);

  const pendingWithdrawVaults: PendingWithdrawVault[] = useMemo(() => {
    if (!hasPendingWithdraw) return [];
    return aaveVaults
      .filter((v) => pendingVaults.get(v.id) === "withdraw")
      .map((v) => ({
        id: v.id,
        amountBtc: v.amount, // VaultData.amount is already BTC
      }));
  }, [aaveVaults, pendingVaults, hasPendingWithdraw]);

  // Derive withdraw data from only in-use vaults (serving as Aave collateral).
  // USD is derived proportionally from total collateral USD because individual
  // vault USD values aren't available from the position data.
  const { inUseVaultIds, inUseBtc, inUseUsd } = useMemo(() => {
    const inUse = collateralVaults.filter((v) => v.inUse);
    const btc = inUse.reduce((sum, v) => sum + v.amountBtc, 0);
    return {
      inUseVaultIds: inUse.map((v) => v.vaultId),
      inUseBtc: btc,
      inUseUsd:
        collateralBtc > 0 ? collateralValueUsd * (btc / collateralBtc) : 0,
    };
  }, [collateralVaults, collateralBtc, collateralValueUsd]);

  // Format display values
  const totalCollateralValue = formatUsdValue(collateralValueUsd);
  const amountToRepay = formatUsdValue(debtValueUsd);
  const totalAmountBtc = formatBtcAmount(collateralBtc);

  const handleWithdraw = () => {
    setIsWithdrawOpen(true);
  };

  const handleBorrow = () => {
    setAssetModalMode(LOAN_TAB.BORROW);
    setIsAssetModalOpen(true);
  };

  const handleRepay = () => {
    if (borrowedAssets.length === 1) {
      const assetSymbol = borrowedAssets[0].symbol;
      navigate(
        `/app/aave/reserve/${assetSymbol.toLowerCase()}?tab=${LOAN_TAB.REPAY}`,
      );
      return;
    }
    setAssetModalMode(LOAN_TAB.REPAY);
    setIsAssetModalOpen(true);
  };

  const handleSelectAsset = (assetSymbol: string) => {
    const basePath = `/app/aave/reserve/${assetSymbol.toLowerCase()}`;
    const path =
      assetModalMode === LOAN_TAB.REPAY
        ? `${basePath}?tab=${LOAN_TAB.REPAY}`
        : basePath;
    navigate(path);
  };

  return (
    <Container className="pb-6">
      <div className="space-y-6">
        <OverviewSection
          healthFactor={healthFactor}
          healthFactorStatus={healthFactorStatus}
          totalCollateralValue={totalCollateralValue}
          amountToRepay={amountToRepay}
          isConnected={isConnected}
        />

        <PendingDepositSection />

        <PendingWithdrawSection pendingWithdrawVaults={pendingWithdrawVaults} />

        <CollateralSection
          totalAmountBtc={totalAmountBtc}
          collateralVaults={collateralVaults}
          hasCollateral={hasCollateral}
          isConnected={isConnected}
          hasDebt={hasDebt}
          onWithdraw={handleWithdraw}
          onDeposit={openDeposit}
        />

        <LoansSection
          hasLoans={hasLoans}
          hasCollateral={hasCollateral}
          isConnected={isConnected}
          borrowedAssets={borrowedAssets}
          healthFactor={healthFactor}
          healthFactorStatus={healthFactorStatus}
          onBorrow={handleBorrow}
          onRepay={handleRepay}
        />
      </div>

      {/* Withdraw Flow */}
      <WithdrawFlow
        open={isWithdrawOpen}
        onClose={() => setIsWithdrawOpen(false)}
        totalAmountBtc={inUseBtc}
        totalAmountUsd={inUseUsd}
        vaultIds={inUseVaultIds}
      />

      {/* Asset Selection Modal for Borrow/Repay */}
      <AssetSelectionModal
        isOpen={isAssetModalOpen}
        onClose={() => setIsAssetModalOpen(false)}
        onSelectAsset={handleSelectAsset}
        mode={assetModalMode}
        assets={
          assetModalMode === LOAN_TAB.REPAY
            ? (selectableBorrowedAssets as Asset[])
            : undefined
        }
      />
    </Container>
  );
}
