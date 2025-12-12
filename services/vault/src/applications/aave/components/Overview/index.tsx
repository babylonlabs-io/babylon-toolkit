/**
 * Aave Overview Page
 *
 * Main application page showing user's Aave position overview including:
 * - Overview section with collateral value and health factor
 * - Vaults table with deposit/redeem options
 * - Collateral and Loans cards
 */

import { Avatar, Button, Container } from "@babylonlabs-io/core-ui";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { Address } from "viem";

import { useETHWallet } from "@/context/wallet";
import { formatBtcAmount, formatUsdValue } from "@/utils/formatting";

import { useAaveUserPosition } from "../../hooks";
import { formatHealthFactor, isHealthFactorHealthy } from "../../utils";
import { AssetSelectionModal } from "../AssetSelectionModal";

import { CollateralCard } from "./components/CollateralCard";
import { LoansCard } from "./components/LoansCard";
import { OverviewCard } from "./components/OverviewCard";
// import { VaultsTable, type VaultData } from "./components/VaultsTable";

export function AaveOverview() {
  const navigate = useNavigate();
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);

  // Wallet connection
  const { address: ethAddressRaw } = useETHWallet();
  const ethAddress = ethAddressRaw as Address | undefined;

  // Fetch user's Aave position
  const { collateralBtc, collateralValueUsd, debtValueUsd, healthFactor } =
    useAaveUserPosition(ethAddress);

  // Derive display values
  const hasCollateral = collateralBtc > 0;
  const hasDebt = debtValueUsd > 0;
  const collateralAmountFormatted = formatBtcAmount(collateralBtc);
  const collateralValueFormatted = formatUsdValue(collateralValueUsd);
  const debtValueFormatted = formatUsdValue(debtValueUsd);
  const healthFactorFormatted = formatHealthFactor(healthFactor);

  const handleBack = () => navigate("/");

  const handleAdd = () => {
    // TODO: Navigate to add collateral flow
  };

  const handleWithdraw = () => {
    // TODO: Navigate to withdraw flow
  };

  const handleBorrow = () => {
    if (hasCollateral) {
      setIsAssetModalOpen(true);
    }
  };

  const handleRepay = () => {
    // TODO: Navigate to repay flow
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSelectAsset = (_assetSymbol: string) => {
    // TODO: Navigate to borrow flow for specific asset
  };

  const handleDeposit = () => {
    // TODO: Navigate to deposit flow
    navigate("/deposit");
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRedeem = (_vaultId: string) => {
    // TODO: Navigate to redeem flow
  };

  // TODO: Remove this when VaultsTable is uncommented
  // Temporary usage to satisfy noUnusedLocals
  void handleDeposit;
  void handleRedeem;

  return (
    <Container className="pb-6">
      <div className="space-y-6">
        {/* Back Button */}
        <Button
          variant="ghost"
          color="primary"
          size="medium"
          className="flex items-center gap-3 !px-2"
          onClick={handleBack}
          aria-label="Back to Applications"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12.5 15L7.5 10L12.5 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-base">Applications</span>
        </Button>

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
        {/* <VaultsTable
          vaults={vaults}
          isConnected={isConnected}
          onRedeem={handleRedeem}
          onDeposit={handleDeposit}
        /> */}

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
          hasLoans={hasDebt}
          hasCollateral={hasCollateral}
          borrowedAmount={debtValueFormatted}
          healthFactor={healthFactorFormatted}
          isHealthy={isHealthFactorHealthy(healthFactor)}
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
