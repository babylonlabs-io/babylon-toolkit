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

// import { useBTCWallet, useETHWallet } from "@/context/wallet";
import { AssetSelectionModal } from "../AssetSelectionModal";

import { CollateralCard } from "./components/CollateralCard";
import { LoansCard } from "./components/LoansCard";
import { OverviewCard } from "./components/OverviewCard";
// import { VaultsTable, type VaultData } from "./components/VaultsTable";

export function AaveOverview() {
  const navigate = useNavigate();
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);

  // Wallet connection
  // const { connected: btcConnected } = useBTCWallet();
  // const { connected: ethConnected } = useETHWallet();
  // const isConnected = useMemo(
  //   () => btcConnected && ethConnected,
  //   [btcConnected, ethConnected],
  // );

  const handleBack = () => navigate("/");

  // Mock vault data
  // const vaults: VaultData[] = [
  //   {
  //     id: "vault-1",
  //     amount: "0.25 BTC",
  //     amountValue: 0.25,
  //     usdValue: "$21,686.17 USD",
  //     usdValueNumber: 21686.17,
  //     provider: {
  //       name: "Babylon Prime",
  //       icon: "https://assets.coingecko.com/coins/images/1/standard/bitcoin.png?1696501400",
  //     },
  //     status: "Available",
  //   },
  //   {
  //     id: "vault-2",
  //     amount: "0.15 BTC",
  //     amountValue: 0.15,
  //     usdValue: "$13,011.70 USD",
  //     usdValueNumber: 13011.7,
  //     provider: {
  //       name: "Babylon Prime",
  //       icon: "https://assets.coingecko.com/coins/images/1/standard/bitcoin.png?1696501400",
  //     },
  //     status: "Available",
  //   },
  // ];

  // Mock data states
  const hasCollateral = false;
  const hasLoans = false;
  const collateralAmount = "";
  const collateralUsdValue = "";
  const borrowedAmount = "";
  const loanHealthFactor = "";

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
          collateralAmount={collateralAmount || "0 BTC"}
          collateralValue={collateralUsdValue || "$0 USD"}
          healthFactor={loanHealthFactor || "0"}
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
          amount={collateralAmount}
          usdValue={collateralUsdValue}
          hasCollateral={hasCollateral}
          onAdd={handleAdd}
          onWithdraw={handleWithdraw}
        />

        {/* Section 4: Loans */}
        <LoansCard
          hasLoans={hasLoans}
          hasCollateral={hasCollateral}
          borrowedAmount={borrowedAmount}
          healthFactor={loanHealthFactor}
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
