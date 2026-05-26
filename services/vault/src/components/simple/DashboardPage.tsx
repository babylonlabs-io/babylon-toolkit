/**
 * DashboardPage Component
 * Composes all dashboard sections into the main dashboard view.
 * Wires real data from Aave hooks and navigation to deposit/borrow/repay flows.
 */

import { Container } from "@babylonlabs-io/core-ui";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";

import { AssetSelectionModal } from "@/applications/aave/components/AssetSelectionModal";
import { LOAN_TAB, type LoanTab } from "@/applications/aave/constants";
import { useSyncPendingVaults } from "@/applications/aave/context";
import { useAaveVaults } from "@/applications/aave/hooks";
import type { PositionNotificationsStatus } from "@/applications/aave/hooks/usePositionNotifications";
import type { CalculatorResult } from "@/applications/aave/positionNotifications";
import type { Asset } from "@/applications/aave/types";
import type { RootLayoutContext } from "@/components/pages/RootLayout";
import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import featureFlags from "@/config/featureFlags";
import { useConnection, useETHWallet } from "@/context/wallet";
import { useApplicationCap } from "@/hooks/useApplicationCap";
import { useDashboardState } from "@/hooks/useDashboardState";
import { usePegoutPolling } from "@/hooks/usePegoutPolling";
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

// Inlined (not via the featureFlags getter) so Vite/Rollup can fold this to a
// constant and tree-shake the debug panel out of production builds where
// NEXT_PUBLIC_FF_POSITION_DEBUG_PANEL is unset. See featureFlags.ts.
const POSITION_DEBUG_PANEL_ENABLED =
  process.env.NEXT_PUBLIC_FF_POSITION_DEBUG_PANEL === "true";

const PositionNotificationsDebugPanel = POSITION_DEBUG_PANEL_ENABLED
  ? lazy(() =>
      import(
        "@/applications/aave/components/PositionNotificationsDebugPanel"
      ).then((m) => ({ default: m.PositionNotificationsDebugPanel })),
    )
  : null;

export function DashboardPage() {
  const navigate = useNavigate();
  const { openDeposit } = useOutletContext<RootLayoutContext>();
  const { address } = useETHWallet();
  const { isConnected } = useConnection();

  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [selectedVaultIds, setSelectedVaultIds] = useState<string[]>([]);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [debugResultOverride, setDebugResultOverride] =
    useState<CalculatorResult | null>(null);
  const [debugStatusOverride, setDebugStatusOverride] =
    useState<PositionNotificationsStatus | null>(null);
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
    collateralVaults,
    selectableBorrowedAssets,
  } = useDashboardState(isConnected ? address : undefined);

  const { snapshot: capSnapshot, isLoading: isCapLoading } = useApplicationCap(
    isConnected ? address : undefined,
  );

  const liquidationNotificationsEnabled =
    featureFlags.isLiquidationNotificationsEnabled;

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

  const handleOpenWithdraw = useCallback(() => {
    setIsWithdrawOpen(true);
  }, []);

  // Clear the list selection whenever the dialog closes (cancel or
  // post-success) so stale checkboxes don't linger on the dashboard.
  const handleCloseWithdraw = useCallback(() => {
    setIsWithdrawOpen(false);
    setSelectedVaultIds([]);
  }, []);

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
    <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
      <div className="space-y-10">
        <SupplyCapSection snapshot={capSnapshot} isLoading={isCapLoading} />

        <OverviewSection
          healthFactor={healthFactor}
          healthFactorStatus={healthFactorStatus}
          totalCollateralValue={totalCollateralValue}
          amountToRepay={amountToRepay}
          isConnected={isConnected}
        />

        {liquidationNotificationsEnabled && (
          <PositionNotificationBanner
            connectedAddress={address}
            onDeposit={openDeposit}
            onRepay={handleRepay}
            result={debugResultOverride ?? undefined}
            statusOverride={debugStatusOverride ?? undefined}
          />
        )}

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
          collateralBtc={collateralBtc}
          currentHealthFactor={healthFactor}
          selectedVaultIds={selectedVaultIds}
          onSelectedVaultIdsChange={setSelectedVaultIds}
          onWithdraw={handleOpenWithdraw}
          onDeposit={openDeposit}
        />

        <LoansSection
          hasLoans={hasLoans}
          hasCollateral={hasCollateral}
          isConnected={isConnected}
          borrowedAssets={borrowedAssets}
          onBorrow={handleBorrow}
          onRepay={handleRepay}
        />

        {liquidationNotificationsEnabled && PositionNotificationsDebugPanel && (
          <Suspense fallback={null}>
            <PositionNotificationsDebugPanel
              onResultChange={setDebugResultOverride}
              onStatusChange={setDebugStatusOverride}
            />
          </Suspense>
        )}
      </div>

      {/* Withdraw Flow */}
      <WithdrawFlow
        open={isWithdrawOpen}
        onClose={handleCloseWithdraw}
        collateralVaults={collateralVaults}
        collateralBtc={collateralBtc}
        collateralValueUsd={collateralValueUsd}
        currentHealthFactor={healthFactor}
        preSelectedVaultIds={selectedVaultIds}
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
