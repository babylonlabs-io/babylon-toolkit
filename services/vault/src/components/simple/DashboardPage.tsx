/**
 * DashboardPage Component
 * Composes all dashboard sections into the main dashboard view.
 * Wires real data from Aave hooks and navigation to deposit/borrow/repay flows.
 */

import { Container } from "@babylonlabs-io/core-ui";
import { useState } from "react";
import { useOutletContext } from "react-router";

import {
  CollateralModal,
  type CollateralMode,
} from "@/applications/aave/components/CollateralModal";
import {
  usePendingVaults,
  useSyncPendingVaults,
} from "@/applications/aave/context";
import { useAaveVaults } from "@/applications/aave/hooks";
import type { RootLayoutContext } from "@/components/pages/RootLayout";
import { useConnection, useETHWallet } from "@/context/wallet";
import { useDashboardState } from "@/hooks/useDashboardState";
import { formatBtcAmount, formatUsdValue } from "@/utils/formatting";

import { BorrowFlow } from "./BorrowFlow";
import { CollateralSection } from "./CollateralSection";
import { LoansSection } from "./LoansSection";
import { OverviewSection } from "./OverviewSection";
import { PendingDepositSection } from "./PendingDepositSection";

export function DashboardPage() {
  const { openDeposit } = useOutletContext<RootLayoutContext>();
  const { address } = useETHWallet();
  const { isConnected } = useConnection();

  const [isCollateralModalOpen, setIsCollateralModalOpen] = useState(false);
  const [collateralModalMode, setCollateralModalMode] =
    useState<CollateralMode>("add");
  const [isBorrowFlowOpen, setIsBorrowFlowOpen] = useState(false);

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
    setIsBorrowFlowOpen(true);
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

      {/* Borrow Flow (full-screen multi-step modal) */}
      <BorrowFlow
        open={isBorrowFlowOpen}
        onClose={() => setIsBorrowFlowOpen(false)}
      />
    </Container>
  );
}
