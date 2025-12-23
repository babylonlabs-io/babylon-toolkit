/**
 * Aave Overview Page
 *
 * Main application page showing user's Aave position overview including:
 * - Overview section with collateral value and health factor
 * - Vaults table with deposit/redeem options
 * - Collateral and Loans cards
 */

import { Avatar, Container } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { BackButton } from "@/components/shared";
import { useETHWallet } from "@/context/wallet";
import { formatBtcAmount, formatUsdValue } from "@/utils/formatting";

import { LOAN_TAB, type LoanTab } from "../../constants";
import {
  useAaveBorrowedAssets,
  useAaveUserPosition,
  useAaveVaults,
} from "../../hooks";
import type { Asset } from "../../types";
import { AssetSelectionModal } from "../AssetSelectionModal";
import { CollateralModal, type CollateralMode } from "../CollateralModal";

import { OverviewCard } from "./components/OverviewCard";
import { PositionCard } from "./components/PositionCard";
import { VaultsTable } from "./components/VaultsTable";

export function AaveOverview() {
  const navigate = useNavigate();
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [assetModalMode, setAssetModalMode] = useState<LoanTab>(
    LOAN_TAB.BORROW,
  );
  const [isCollateralModalOpen, setIsCollateralModalOpen] = useState(false);
  const [collateralModalMode, setCollateralModalMode] =
    useState<CollateralMode>("add");

  // Wallet connection
  const { address } = useETHWallet();

  // Fetch user's Aave position
  const {
    position,
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    healthFactorStatus,
  } = useAaveUserPosition(address);

  // Fetch user's vaults
  const { vaults, availableForCollateral } = useAaveVaults(address);

  // Fetch user's borrowed assets (reuses position data to avoid duplicate RPC calls)
  const { borrowedAssets, hasLoans } = useAaveBorrowedAssets({
    position,
    debtValueUsd,
  });

  const selectableBorrowedAssets = useMemo(
    (): Asset[] =>
      borrowedAssets.map((asset) => ({
        symbol: asset.symbol,
        name: asset.symbol,
        icon: asset.icon,
      })),
    [borrowedAssets],
  );

  // Derive display values
  const hasCollateral = collateralBtc > 0;
  const hasAvailableVaults = availableForCollateral.length > 0;
  const collateralAmountFormatted = formatBtcAmount(collateralBtc);
  const collateralValueFormatted = formatUsdValue(collateralValueUsd);
  const isConnected = !!address;

  const handleBack = () => navigate("/");

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

    // Multiple borrowed assets: show selection modal
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

  const handleDeposit = () => {
    // TODO: Navigate to deposit flow
    navigate("/deposit");
  };

  const handleRedeem = (vaultId: string) => {
    // TODO: Navigate to redeem flow
    void vaultId;
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
          Borrow assets using vaultBTC as collateral. Deposit BTC into a vault
          to enable borrowing through Aave.
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
          isConnected={isConnected}
          onRedeem={handleRedeem}
          onDeposit={handleDeposit}
        />

        {/* Section 3: Position (Collateral & Loans with Tabs) */}
        <PositionCard
          collateralAmount={collateralAmountFormatted}
          collateralUsdValue={collateralValueFormatted}
          hasCollateral={hasCollateral}
          hasAvailableVaults={hasAvailableVaults}
          isConnected={isConnected}
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

      {/* Asset Selection Modal */}
      <AssetSelectionModal
        isOpen={isAssetModalOpen}
        onClose={() => setIsAssetModalOpen(false)}
        onSelectAsset={handleSelectAsset}
        mode={assetModalMode}
        assets={
          assetModalMode === LOAN_TAB.REPAY
            ? selectableBorrowedAssets
            : undefined
        }
      />

      {/* Collateral Modal (Add/Withdraw) */}
      <CollateralModal
        isOpen={isCollateralModalOpen}
        onClose={() => setIsCollateralModalOpen(false)}
        mode={collateralModalMode}
      />
    </Container>
  );
}
