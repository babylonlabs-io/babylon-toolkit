/**
 * Aave Overview Page
 *
 * Main application page showing user's Aave position overview including:
 * - Overview section with collateral value and health factor
 * - Vaults table with deposit/redeem options
 * - Collateral and Loans cards
 */

import { Avatar, Container } from "@babylonlabs-io/core-ui";
import { useState } from "react";
import { useNavigate } from "react-router";

import { RedeemModals } from "@/components/deposit/RedeemModals";
import { BackButton } from "@/components/shared";
import { BorrowFlow } from "@/components/simple/BorrowFlow";
import { getNetworkConfigBTC } from "@/config";
import { VaultRedeemState } from "@/context/deposit/VaultRedeemState";
import { useETHWallet } from "@/context/wallet";
import { formatBtcAmount, formatUsdValue } from "@/utils/formatting";

import { AAVE_APP_ID } from "../../config";
import { LOAN_TAB, type LoanTab } from "../../constants";
import { CollateralModal, type CollateralMode } from "../CollateralModal";

import { OverviewCard } from "./components/OverviewCard";
import { PositionCard } from "./components/PositionCard";
import { VaultsTable } from "./components/VaultsTable";
import { useAaveOverviewState } from "./useAaveOverviewState";

const btcConfig = getNetworkConfigBTC();

/**
 * Inner component that uses redeem state context
 */
function AaveOverviewContent() {
  const navigate = useNavigate();
  const [isBorrowFlowOpen, setIsBorrowFlowOpen] = useState(false);
  const [borrowFlowInitialTab, setBorrowFlowInitialTab] = useState<LoanTab>(
    LOAN_TAB.BORROW,
  );
  const [isCollateralModalOpen, setIsCollateralModalOpen] = useState(false);
  const [collateralModalMode, setCollateralModalMode] =
    useState<CollateralMode>("add");

  // Wallet connection
  const { address } = useETHWallet();

  // All state and data from custom hook
  const {
    collateralBtc,
    collateralValueUsd,
    healthFactor,
    healthFactorStatus,
    vaults,
    deposits,
    activities,
    hasPendingAdd,
    hasPendingWithdraw,
    borrowedAssets,
    hasLoans,
    hasCollateral,
    hasAvailableVaults,
    triggerRedeem,
    onRedeemSuccess,
  } = useAaveOverviewState(address);

  // Format display values
  const collateralAmountFormatted = formatBtcAmount(collateralBtc);
  const collateralValueFormatted = formatUsdValue(collateralValueUsd);

  // Navigation handlers
  const handleBack = () => navigate("/");

  const handleDeposit = () => {
    navigate(`/deposit?app=${AAVE_APP_ID}`);
  };

  // Modal handlers
  const handleAdd = () => {
    setCollateralModalMode("add");
    setIsCollateralModalOpen(true);
  };

  const handleWithdraw = () => {
    setCollateralModalMode("withdraw");
    setIsCollateralModalOpen(true);
  };

  const handleBorrow = () => {
    setBorrowFlowInitialTab(LOAN_TAB.BORROW);
    setIsBorrowFlowOpen(true);
  };

  // No initialAsset passed — opens at asset selection step (unlike DashboardPage
  // which passes the asset symbol from per-loan "Repay" buttons to skip selection)
  const handleRepay = () => {
    setBorrowFlowInitialTab(LOAN_TAB.REPAY);
    setIsBorrowFlowOpen(true);
  };

  return (
    <Container className="pb-6">
      <div className="space-y-6">
        {/* Back Button */}
        <BackButton label="Applications" onClick={handleBack} />

        {/* Header */}
        <div className="flex items-center gap-6">
          <Avatar
            url="/images/aave.svg"
            alt="Aave"
            size="xlarge"
            className="!rounded-2xl"
          />
          <span className="text-[48px] font-normal text-accent-primary">
            Aave
          </span>
        </div>

        <p className="text-base text-accent-secondary">
          Borrow assets using vaultBTC as collateral. Deposit{" "}
          {btcConfig.coinSymbol} into a vault to enable borrowing through Aave.
        </p>

        {/* Section 1: Overview */}
        <OverviewCard
          collateralAmount={collateralAmountFormatted}
          collateralValue={collateralValueFormatted}
          healthFactor={healthFactor}
          healthFactorStatus={healthFactorStatus}
        />

        {/* Section 2: Vaults Table */}
        <VaultsTable
          vaults={vaults}
          onRedeem={triggerRedeem}
          onDeposit={handleDeposit}
        />

        {/* Section 3: Position (Collateral & Loans with Tabs) */}
        <PositionCard
          collateralAmount={collateralAmountFormatted}
          collateralUsdValue={collateralValueFormatted}
          hasCollateral={hasCollateral}
          hasAvailableVaults={hasAvailableVaults}
          isPendingAdd={hasPendingAdd}
          isPendingWithdraw={hasPendingWithdraw}
          onAdd={handleAdd}
          onWithdraw={handleWithdraw}
          hasLoans={hasLoans}
          borrowedAssets={borrowedAssets}
          healthFactor={healthFactor}
          healthFactorStatus={healthFactorStatus}
          onBorrow={handleBorrow}
          onRepay={handleRepay}
        />
      </div>

      {/* Borrow/Repay Flow (full-screen multi-step modal with tabs) */}
      <BorrowFlow
        open={isBorrowFlowOpen}
        onClose={() => setIsBorrowFlowOpen(false)}
        initialTab={borrowFlowInitialTab}
      />

      {/* Collateral Modal (Add/Withdraw) */}
      <CollateralModal
        isOpen={isCollateralModalOpen}
        onClose={() => setIsCollateralModalOpen(false)}
        mode={collateralModalMode}
      />

      {/* Redeem Modals - manages its own state internally */}
      <RedeemModals
        deposits={deposits}
        activities={activities}
        onSuccess={onRedeemSuccess}
      />
    </Container>
  );
}

/**
 * Aave Overview page wrapper with redeem state provider
 */
export function AaveOverview() {
  return (
    <VaultRedeemState>
      <AaveOverviewContent />
    </VaultRedeemState>
  );
}
