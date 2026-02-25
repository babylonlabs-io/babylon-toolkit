/**
 * DashboardPage Component
 * Composes all dashboard sections into the main dashboard view.
 * Wires real data from Aave hooks and navigation to deposit/borrow/repay flows.
 */

import { Container } from "@babylonlabs-io/core-ui";
import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router";

import { AssetSelectionModal } from "@/applications/aave/components/AssetSelectionModal";
import {
  CollateralModal,
  type CollateralMode,
} from "@/applications/aave/components/CollateralModal";
import { LOAN_TAB, type LoanTab } from "@/applications/aave/constants";
import {
  usePendingVaults,
  useSyncPendingVaults,
} from "@/applications/aave/context";
import { useAaveVaults } from "@/applications/aave/hooks";
import type { Asset } from "@/applications/aave/types";
import type { RootLayoutContext } from "@/components/pages/RootLayout";
import { useConnection, useETHWallet } from "@/context/wallet";
import { useDashboardState } from "@/hooks/useDashboardState";
import { formatBtcAmount, formatUsdValue } from "@/utils/formatting";

import { CollateralSection } from "./CollateralSection";
import { LoansSection } from "./LoansSection";
import { OverviewSection } from "./OverviewSection";
import { PendingDepositSection } from "./PendingDepositSection";

export function DashboardPage() {
  const navigate = useNavigate();
  const { openDeposit } = useOutletContext<RootLayoutContext>();
  const { address } = useETHWallet();
  const { isConnected } = useConnection();

  const [isCollateralModalOpen, setIsCollateralModalOpen] = useState(false);
  const [collateralModalMode, setCollateralModalMode] =
    useState<CollateralMode>("add");
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
  } = useDashboardState(address);

  const { availableForCollateral, vaults: aaveVaults } = useAaveVaults(address);
  const hasAvailableVaults = availableForCollateral.length > 0;
  const { hasPendingAdd, hasPendingWithdraw } = usePendingVaults();
  useSyncPendingVaults(aaveVaults);

  // Format display values
  const totalCollateralValue = formatUsdValue(collateralValueUsd);
  const amountToRepay = formatUsdValue(debtValueUsd);
  const totalAmountBtc = formatBtcAmount(collateralBtc);

  const handleAdd = () => {
    setCollateralModalMode("add");
    setIsCollateralModalOpen(true);
  };

  const handleWithdraw = () => {
    setCollateralModalMode("withdraw");
    setIsCollateralModalOpen(true);
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

        <CollateralSection
          totalAmountBtc={totalAmountBtc}
          collateralVaults={collateralVaults}
          hasCollateral={hasCollateral}
          isConnected={isConnected}
          hasDebt={hasDebt}
          hasAvailableVaults={hasAvailableVaults}
          isPendingAdd={hasPendingAdd}
          isPendingWithdraw={hasPendingWithdraw}
          onAdd={handleAdd}
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
          canAdd={hasAvailableVaults && !hasPendingAdd && !hasPendingWithdraw}
          onAdd={handleAdd}
        />
      </div>

      {/* Collateral Add/Withdraw Modal */}
      <CollateralModal
        isOpen={isCollateralModalOpen}
        onClose={() => setIsCollateralModalOpen(false)}
        mode={collateralModalMode}
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
