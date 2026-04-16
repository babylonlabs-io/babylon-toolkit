/**
 * DashboardPage Component
 * Composes all dashboard sections into the main dashboard view.
 * Wires real data from Aave hooks and navigation to deposit/borrow/repay flows.
 */

import { Container } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";

import { AssetSelectionModal } from "@/applications/aave/components/AssetSelectionModal";
import { PositionNotificationsDebugPanel } from "@/applications/aave/components/PositionNotificationsDebugPanel";
import { LOAN_TAB, type LoanTab } from "@/applications/aave/constants";
import { useSyncPendingVaults } from "@/applications/aave/context";
import { useAaveVaults } from "@/applications/aave/hooks";
import type { CalculatorResult } from "@/applications/aave/positionNotifications";
import type { Asset } from "@/applications/aave/types";
import type { RootLayoutContext } from "@/components/pages/RootLayout";
import featureFlags from "@/config/featureFlags";
import { useBTCWallet, useConnection, useETHWallet } from "@/context/wallet";
import { useApplicationCap } from "@/hooks/useApplicationCap";
import { useDashboardState } from "@/hooks/useDashboardState";
import { usePegoutPolling } from "@/hooks/usePegoutPolling";
import { calculateBalance, useUTXOs } from "@/hooks/useUTXOs";
import { ClaimerPegoutStatusValue } from "@/models/pegoutStateMachine";
import { formatBtcAmount, formatUsdValue } from "@/utils/formatting";

import { CollateralSection } from "./CollateralSection";
import { LoansSection } from "./LoansSection";
import { OverviewSection } from "./OverviewSection";
import { PendingDepositSection } from "./PendingDepositSection";
import { PendingWithdrawSection } from "./PendingWithdrawSection";
import { PositionNotificationBanner } from "./PositionNotificationBanner";
import { SupplyCapSection } from "./SupplyCapSection";
import WithdrawFlow from "./WithdrawFlow";

export function DashboardPage() {
  const navigate = useNavigate();
  const { openDeposit } = useOutletContext<RootLayoutContext>();
  const { address } = useETHWallet();
  const { address: btcAddress } = useBTCWallet();
  const { isConnected } = useConnection();
  const { spendableUTXOs, isLoading: isLoadingUTXOs } = useUTXOs(btcAddress);
  const btcBalanceBtc = isLoadingUTXOs
    ? undefined
    : calculateBalance(spendableUTXOs) / 100_000_000;

  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [debugResultOverride, setDebugResultOverride] =
    useState<CalculatorResult | null>(null);
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

  const { snapshot: capSnapshot, isLoading: isCapLoading } = useApplicationCap(
    isConnected ? address : undefined,
  );

  const { vaults: aaveVaults, redeemedVaults } = useAaveVaults(
    isConnected ? address : undefined,
  );
  const { pegoutStatuses } = usePegoutPolling({
    redeemedVaults,
  });

  // Filter out vaults whose payout has been broadcast (terminal success).
  // Failed vaults are intentionally kept visible so the user sees the error and can contact support.
  const pendingWithdrawVaults = useMemo(
    () =>
      redeemedVaults.filter((vault) => {
        const status = pegoutStatuses.get(vault.id);
        return (
          status?.response?.claimer?.status !==
          ClaimerPegoutStatusValue.PAYOUT_BROADCAST
        );
      }),
    [redeemedVaults, pegoutStatuses],
  );

  // Sync pending vault operations (add/withdraw) with indexer data
  useSyncPendingVaults(aaveVaults);

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
        <SupplyCapSection snapshot={capSnapshot} isLoading={isCapLoading} />

        <OverviewSection
          healthFactor={healthFactor}
          healthFactorStatus={healthFactorStatus}
          totalCollateralValue={totalCollateralValue}
          amountToRepay={amountToRepay}
          isConnected={isConnected}
        />

        <PositionNotificationBanner
          connectedAddress={address}
          onDeposit={openDeposit}
          onRepay={handleRepay}
          result={debugResultOverride ?? undefined}
          btcBalanceBtc={btcBalanceBtc}
        />

        <PendingDepositSection />

        <PendingWithdrawSection
          pendingWithdrawVaults={pendingWithdrawVaults}
          pegoutStatuses={pegoutStatuses}
        />

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

        {featureFlags.isPositionNotificationsEnabled && (
          <PositionNotificationsDebugPanel
            onResultChange={setDebugResultOverride}
          />
        )}
      </div>

      {/* Withdraw Flow */}
      <WithdrawFlow
        open={isWithdrawOpen}
        onClose={() => setIsWithdrawOpen(false)}
        collateralVaults={collateralVaults}
        collateralBtc={collateralBtc}
        collateralValueUsd={collateralValueUsd}
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
