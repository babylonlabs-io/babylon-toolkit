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
import type { Address } from "viem";

import { BackButton } from "@/components/shared";
import { useETHWallet } from "@/context/wallet";
import { formatBtcAmount, formatUsdValue } from "@/utils/formatting";

import {
  useAaveBorrowedAssets,
  useAaveUserPosition,
  useAaveVaults,
} from "../../hooks";
import { AssetSelectionModal } from "../AssetSelectionModal";

import { CollateralCard } from "./components/CollateralCard";
import { LoansCard } from "./components/LoansCard";
import { OverviewCard } from "./components/OverviewCard";
import { VaultsTable } from "./components/VaultsTable";

export function AaveOverview() {
  const navigate = useNavigate();
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);

  // Wallet connection
  const { address: ethAddressRaw } = useETHWallet();
  const ethAddress = ethAddressRaw as Address | undefined;

  // Fetch user's Aave position
  const {
    position,
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
  } = useAaveUserPosition(ethAddress);

  // Fetch user's vaults
  const { vaults } = useAaveVaults(ethAddress);

  // Fetch user's borrowed assets (reuses position data to avoid duplicate RPC calls)
  const { borrowedAssets, hasLoans } = useAaveBorrowedAssets({
    position,
    debtValueUsd,
  });

  // Derive display values
  const hasCollateral = collateralBtc > 0;
  const collateralAmountFormatted = formatBtcAmount(collateralBtc);
  const collateralValueFormatted = formatUsdValue(collateralValueUsd);
  const isConnected = !!ethAddress;

  const handleBack = () => navigate("/");

  const handleAdd = () => {
    // TODO: Navigate to add collateral flow
  };

  const handleWithdraw = () => {
    // TODO: Navigate to withdraw flow
  };

  const handleBorrow = () => {
    setIsAssetModalOpen(true);
  };

  const handleRepay = () => {
    // TODO: Navigate to repay flow
  };

  const handleSelectAsset = (assetSymbol: string) => {
    navigate(`/app/aave/reserve/${assetSymbol.toLowerCase()}`);
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
        />

        {/* Section 2: Vaults Table */}
        <VaultsTable
          vaults={vaults}
          isConnected={isConnected}
          onRedeem={handleRedeem}
          onDeposit={handleDeposit}
        />

        {/* Section 3: Collateral */}
        <CollateralCard
          amount={collateralAmountFormatted}
          usdValue={collateralValueFormatted}
          hasCollateral={hasCollateral}
          onAdd={handleAdd}
          onWithdraw={handleWithdraw}
        />

        {/* Section 4: Loans */}
        <LoansCard
          hasLoans={hasLoans}
          hasCollateral={hasCollateral}
          borrowedAssets={borrowedAssets}
          healthFactor={healthFactor}
          onBorrow={handleBorrow}
          onRepay={handleRepay}
        />
      </div>

      {/* Asset Selection Modal */}
      <AssetSelectionModal
        isOpen={isAssetModalOpen}
        onClose={() => setIsAssetModalOpen(false)}
        onSelectAsset={handleSelectAsset}
      />
    </Container>
  );
}
