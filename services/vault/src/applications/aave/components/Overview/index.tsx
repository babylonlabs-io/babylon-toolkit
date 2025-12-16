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
import type { Address, Hex } from "viem";

import { BackButton } from "@/components/shared";
import { useETHWallet } from "@/context/wallet";
import { useBTCPrice } from "@/hooks/useBTCPrice";
import { PEGIN_DISPLAY_LABELS } from "@/models/peginStateMachine";
import { formatBtcAmount, formatUsdValue } from "@/utils/formatting";

import { useAaveConfig } from "../../context";
import {
  useAaveBorrowedAssets,
  useAaveUserPosition,
  useAaveVaults,
} from "../../hooks";
import { AddCollateralModal } from "../AddCollateralModal";
import { AssetSelectionModal } from "../AssetSelectionModal";

import { OverviewCard } from "./components/OverviewCard";
import { PositionCard } from "./components/PositionCard";
import { VaultsTable } from "./components/VaultsTable";

export function AaveOverview() {
  const navigate = useNavigate();
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [isAddCollateralOpen, setIsAddCollateralOpen] = useState(false);
  const [isProcessingCollateral, setIsProcessingCollateral] = useState(false);

  // Wallet connection
  const { address: ethAddressRaw } = useETHWallet();
  const ethAddress = ethAddressRaw as Address | undefined;

  // Fetch Aave config for vbtcReserve (to get liquidation LTV)
  const { vbtcReserve } = useAaveConfig();

  // Fetch BTC price
  const { btcPriceUSD } = useBTCPrice();

  // Fetch user's Aave position
  const {
    position,
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    healthFactorStatus,
    refetch: refetchPosition,
  } = useAaveUserPosition(ethAddress);

  // Fetch user's vaults
  const { vaults } = useAaveVaults(ethAddress);

  // Fetch user's borrowed assets (reuses position data to avoid duplicate RPC calls)
  const { borrowedAssets, hasLoans } = useAaveBorrowedAssets({
    position,
    debtValueUsd,
  });

  // Filter available vaults (not "In Use")
  const availableVaults = useMemo(() => {
    return vaults.filter(
      (vault) => vault.status !== PEGIN_DISPLAY_LABELS.IN_USE,
    );
  }, [vaults]);

  // Get liquidation threshold in BPS from vbtcReserve's collateralRisk
  const liquidationThresholdBps = useMemo(() => {
    if (!vbtcReserve) return 7500; // Default fallback (75%)
    return vbtcReserve.reserve.collateralRisk;
  }, [vbtcReserve]);

  // Derive display values
  const hasCollateral = collateralBtc > 0;
  const collateralAmountFormatted = formatBtcAmount(collateralBtc);
  const collateralValueFormatted = formatUsdValue(collateralValueUsd);
  const isConnected = !!ethAddress;

  const handleBack = () => navigate("/");

  const handleAdd = () => {
    setIsAddCollateralOpen(true);
  };

  const handleAddCollateral = async (vaultIds: string[]) => {
    if (vaultIds.length === 0) return;

    setIsProcessingCollateral(true);
    try {
      // TODO: Integrate with wallet context to execute addCollateral transaction
      // The addCollateral function from positionTransactions.ts takes:
      // - walletClient: WalletClient
      // - chain: Chain
      // - vaultIds: Hex[]
      void (vaultIds as Hex[]);

      // Refetch position data
      await refetchPosition();

      // Close modal on success
      setIsAddCollateralOpen(false);
    } catch (error) {
      console.error("Failed to add collateral:", error);
    } finally {
      setIsProcessingCollateral(false);
    }
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
      />

      {/* Add Collateral Modal */}
      <AddCollateralModal
        isOpen={isAddCollateralOpen}
        onClose={() => setIsAddCollateralOpen(false)}
        onDeposit={handleAddCollateral}
        availableVaults={availableVaults}
        currentCollateralUsd={collateralValueUsd}
        currentDebtUsd={debtValueUsd}
        liquidationThresholdBps={liquidationThresholdBps}
        btcPrice={btcPriceUSD || 0}
        processing={isProcessingCollateral}
      />
    </Container>
  );
}
