/**
 * Aave Overview Page
 *
 * Main application page showing user's Aave position overview including:
 * - Overview section with collateral value and health factor
 * - Vaults table with deposit/redeem options
 * - Collateral and Loans cards
 */

import { Avatar, Container } from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Address } from "viem";

import { BackButton } from "@/components/shared";
import { useETHWallet } from "@/context/wallet";
import { formatBtcAmount, formatUsdValue } from "@/utils/formatting";

import { useAaveUserPosition } from "../../hooks";
import { formatHealthFactor } from "../../utils";
import { AssetSelectionModal } from "../AssetSelectionModal";

import { CollateralCard } from "./components/CollateralCard";
import { LoansCard, type BorrowedAsset } from "./components/LoansCard";
import { OverviewCard } from "./components/OverviewCard";
import { VaultsTable, type VaultData } from "./components/VaultsTable";

// Mock borrowed assets for demo
const MOCK_BORROWED_ASSETS: BorrowedAsset[] = [
  {
    symbol: "USDC",
    amount: "7590.16",
    icon: "/images/usdc.png",
  },
  {
    symbol: "USDT",
    amount: "7590.16",
    icon: "/images/usdt.png",
  },
];

export function AaveOverview() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [borrowedAssets, setBorrowedAssets] =
    useState<BorrowedAsset[]>(MOCK_BORROWED_ASSETS);

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
  const healthFactorFormatted = formatHealthFactor(healthFactor);

  // Read loan state from navigation when returning from borrow flow
  useEffect(() => {
    const state = location.state as { borrowedAssets?: BorrowedAsset[] } | null;
    if (state?.borrowedAssets) {
      setBorrowedAssets(state.borrowedAssets);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleBack = () => navigate("/");

  // Mock vault data
  const vaults: VaultData[] = [
    {
      id: "vault-1",
      amount: "0.25 BTC",
      amountValue: 0.25,
      usdValue: "$21,686.17 USD",
      usdValueNumber: 21686.17,
      provider: {
        name: "Babylon Prime",
        icon: "https://www.gravatar.com/avatar/babylon-prime?d=identicon&s=64",
      },
      status: "Available",
    },
    {
      id: "vault-2",
      amount: "0.15 BTC",
      amountValue: 0.15,
      usdValue: "$13,011.70 USD",
      usdValueNumber: 13011.7,
      provider: {
        name: "Babylon Prime",
        icon: "https://www.gravatar.com/avatar/babylon-prime?d=identicon&s=64",
      },
      status: "Available",
    },
  ];

  // TODO: Replace with actual wallet connection
  const isConnected = true;

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
    navigate(`/app/aave/market/${assetSymbol.toLowerCase()}`);
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
          hasLoans={hasDebt}
          hasCollateral={hasCollateral}
          borrowedAssets={borrowedAssets}
          healthFactor={healthFactorFormatted}
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
