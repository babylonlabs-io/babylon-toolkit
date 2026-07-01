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
import { usePositionNotifications } from "@/applications/aave/hooks/usePositionNotifications";
import type { Asset } from "@/applications/aave/types";
import type { RootLayoutContext } from "@/components/pages/RootLayout";
import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import featureFlags from "@/config/featureFlags";
import { useConnection, useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { PositionNotificationsDebugPanel } from "@/dev/PositionNotificationsDebugPanel";
import { useDebugPositionOverride } from "@/dev/debugPositionStore";
import { useDemoCollateral, useDemoWithdrawal } from "@/dev/demoDeposit";
import { useApplicationCap } from "@/hooks/useApplicationCap";
import { useDashboardState } from "@/hooks/useDashboardState";
import { usePegoutPolling } from "@/hooks/usePegoutPolling";
import { usePrices } from "@/hooks/usePrices";
import { ClaimerPegoutStatusValue } from "@/models/pegoutStateMachine";
import {
  formatBtcAmount,
  formatLiquidationDistancePercent,
  formatUsdPrice,
  formatUsdValue,
} from "@/utils/formatting";

import { CollateralSection } from "./CollateralSection";
import { CriticalLiquidationTopBanner } from "./CriticalLiquidationTopBanner";
import { DisconnectedOverview } from "./DisconnectedOverview";
import { LoansSection } from "./LoansSection";
import { MaxVaultsNotification } from "./MaxVaultsNotification";
import { OverviewSection } from "./OverviewSection";
import { PendingDepositSection } from "./PendingDepositSection";
import { PendingWithdrawSection } from "./PendingWithdrawSection";
import { PositionNotificationBanner } from "./PositionNotificationBanner";
import { SupplyCapSection } from "./SupplyCapSection";
import WithdrawFlow from "./WithdrawFlow";

// Dev-only god-mode panel, lazily imported behind `import.meta.env.DEV` so its
// code is dropped from production builds entirely (the dynamic import sits in a
// dead branch that the bundler eliminates).
const GodModePanel = import.meta.env.DEV
  ? lazy(() =>
      import("@/dev/GodModePanel").then((m) => ({ default: m.GodModePanel })),
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
  const [assetModalMode, setAssetModalMode] = useState<LoanTab>(
    LOAN_TAB.BORROW,
  );

  // Dev-only banner override driven by the position-notifications section of
  // the god-mode panel (see debugPositionStore). Always null in production, so
  // the banners fall back to the live calculation with no behavioural change.
  const { result: debugResultOverride, status: debugStatusOverride } =
    useDebugPositionOverride();
  const {
    collateralBtc,
    displayCollateralBtc,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    healthFactorStatus,
    borrowedAssets,
    hasLoans,
    hasCollateral,
    hasDisplayCollateral,
    collateralVaults,
    selectableBorrowedAssets,
  } = useDashboardState(isConnected ? address : undefined);

  const { snapshot: capSnapshot, isLoading: isCapLoading } = useApplicationCap(
    isConnected ? address : undefined,
  );

  const { result: positionNotifications } = usePositionNotifications(
    isConnected ? address : undefined,
  );
  const { prices, metadata } = usePrices();

  const liquidationNotificationsEnabled =
    featureFlags.isLiquidationNotificationsEnabled;

  // Feed the critical top banner the same debug-aware result the mid-page banner
  // uses: the debug override when set, otherwise the live calculation.
  const criticalBannerResult = debugResultOverride ?? positionNotifications;

  const { vaults: aaveVaults, redeemedVaults } = useAaveVaults(
    isConnected ? address : undefined,
  );
  const { pegoutStatuses } = usePegoutPolling({
    redeemedVaults,
  });

  // Every redeemed vault shows its staged progress until it leaves the redeemed
  // set on-chain (payout settles / vault closes). The in-progress/completed
  // split below routes the terminal "Payout sent" state to the Withdrawals
  // section; everything else (incl. "Blocked") stays under Pending Withdrawals.
  //
  // God-mode demo withdrawal (dev only; null unless the panel is on). Merged in
  // here — and the real rows hidden when `hideReal` is set — so the demo renders
  // in the real withdrawal sections. Inert in production.
  const demoWithdrawal = useDemoWithdrawal();
  const pendingWithdrawVaults = useMemo(() => {
    if (!demoWithdrawal) return redeemedVaults;
    return [
      ...demoWithdrawal.vaults,
      ...(demoWithdrawal.hideReal ? [] : redeemedVaults),
    ];
  }, [redeemedVaults, demoWithdrawal]);
  const withdrawPegoutStatuses = useMemo(() => {
    if (!demoWithdrawal) return pegoutStatuses;
    const merged = new Map(demoWithdrawal.hideReal ? [] : pegoutStatuses);
    for (const [id, status] of demoWithdrawal.statuses) merged.set(id, status);
    return merged;
  }, [pegoutStatuses, demoWithdrawal]);

  // God-mode demo collateral (dev only; null unless the panel is on). Merged
  // into the Collateral section's list, with the real rows hidden when
  // `hideReal` is set. Inert in production.
  const demoCollateral = useDemoCollateral();
  const collateralVaultsWithDemo = useMemo(() => {
    if (!demoCollateral) return collateralVaults;
    return [
      ...demoCollateral.vaults,
      ...(demoCollateral.hideReal ? [] : collateralVaults),
    ];
  }, [collateralVaults, demoCollateral]);
  const showCollateral =
    hasDisplayCollateral || (demoCollateral?.vaults.length ?? 0) > 0;
  // When the demo changes the collateral list (adds a row or hides the real
  // ones), the summary total must reflect the rendered list — otherwise the
  // header reads "0 sBTC" above a demo card. Real totals are untouched
  // otherwise (the demo can't mutate financial state).
  const demoAffectsCollateral =
    demoCollateral !== null &&
    (demoCollateral.vaults.length > 0 || demoCollateral.hideReal);
  const collateralBtcShown = demoAffectsCollateral
    ? collateralVaultsWithDemo.reduce((sum, vault) => sum + vault.amountBtc, 0)
    : collateralBtc;
  const totalAmountBtcShown = demoAffectsCollateral
    ? formatBtcAmount(collateralBtcShown)
    : formatBtcAmount(displayCollateralBtc);

  // A "Payout sent" withdrawal is terminal success — the depositor's BTC is on
  // its way — so it belongs under "Withdrawals", not "Pending Withdrawals".
  // Everything still advancing (incl. the "Blocked" error state) stays pending.
  const { inProgressWithdrawVaults, completedWithdrawVaults } = useMemo(() => {
    const inProgressWithdrawVaults: typeof pendingWithdrawVaults = [];
    const completedWithdrawVaults: typeof pendingWithdrawVaults = [];
    for (const vault of pendingWithdrawVaults) {
      const payoutSent =
        withdrawPegoutStatuses.get(vault.id)?.response?.claimer?.status ===
        ClaimerPegoutStatusValue.PAYOUT_BROADCAST;
      if (payoutSent) {
        completedWithdrawVaults.push(vault);
      } else {
        inProgressWithdrawVaults.push(vault);
      }
    }
    return { inProgressWithdrawVaults, completedWithdrawVaults };
  }, [pendingWithdrawVaults, withdrawPegoutStatuses]);

  // Sync pending vault operations (add/withdraw) with indexer data
  useSyncPendingVaults(aaveVaults);

  // Format display values
  const totalCollateralValue = formatUsdValue(collateralValueUsd);
  const totalBorrowed = formatUsdValue(debtValueUsd);

  // Liquidation-risk gauge stats. Liquidation price and distance-to-liquidation
  // come from the first group of the position cascade (the price at which the
  // first seizure triggers); BTC price comes from the live oracle feed. Fall
  // back to the empty-value placeholder until the inputs are available, and
  // suppress the BTC price whenever its oracle round is stale or fetch-failed
  // (mirroring the guard in usePositionNotifications) so a price sourced from a
  // bad feed never sits beside liquidation stats derived from that same feed.
  // Note this does not cover the brief transient while the cascade is still
  // loading: a freshly-fetched BTC price can render beside placeholder stats.
  const firstLiquidationGroup = positionNotifications?.groups[0] ?? null;
  const btcPriceUsd = prices["BTC"];
  const btcMetadata = metadata["BTC"];
  const isBtcPriceUsable =
    btcMetadata !== undefined &&
    !btcMetadata.isStale &&
    !btcMetadata.fetchFailed;
  const liquidationPrice = firstLiquidationGroup
    ? formatUsdPrice(firstLiquidationGroup.liquidationPrice)
    : COPY.common.emptyValue;
  const btcPrice =
    isBtcPriceUsable && btcPriceUsd !== undefined && btcPriceUsd > 0
      ? formatUsdPrice(btcPriceUsd)
      : COPY.common.emptyValue;
  const pctToLiquidation = firstLiquidationGroup
    ? formatLiquidationDistancePercent(-firstLiquidationGroup.distancePct)
    : COPY.common.emptyValue;

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
        `/app/aave/reserve/${assetSymbol.toLowerCase()}/${LOAN_TAB.REPAY}`,
      );
      return;
    }
    setAssetModalMode(LOAN_TAB.REPAY);
    setIsAssetModalOpen(true);
  };

  const handleSelectAsset = (assetSymbol: string) => {
    navigate(
      `/app/aave/reserve/${assetSymbol.toLowerCase()}/${assetModalMode}`,
    );
  };

  // Dev/QA god-mode admin panel (NEXT_PUBLIC_FF_GOD_MODE_PANEL). Floats over
  // the page and drives the demo items rendered in the real sections below.
  // Stripped from production builds and never active there (see GodModePanel).
  // The position-notifications debug controls live inside the god-mode panel as
  // a section (gated by their own flag), so there's one integrated debug
  // surface rather than a separate panel on the page.
  const godModePanel =
    import.meta.env.DEV &&
    GodModePanel &&
    featureFlags.isGodModePanelEnabled ? (
      <Suspense fallback={null}>
        <GodModePanel>
          {liquidationNotificationsEnabled &&
            featureFlags.isPositionDebugPanelEnabled && (
              <PositionNotificationsDebugPanel />
            )}
        </GodModePanel>
      </Suspense>
    ) : null;

  if (!isConnected) {
    return (
      <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
        <DisconnectedOverview capSnapshot={capSnapshot} />
        {godModePanel}
      </Container>
    );
  }

  return (
    <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
      <div className="space-y-10">
        <SupplyCapSection snapshot={capSnapshot} isLoading={isCapLoading} />

        {/* Notifications sit between the supply cap and Overview per Figma
            (frame 6508-114810). The critical top banner, the max-vaults notice,
            and the cascade banner share this slot. */}
        {liquidationNotificationsEnabled && (
          <CriticalLiquidationTopBanner result={criticalBannerResult} />
        )}

        {/* "Maximum vaults reached" is a value-protection capacity fact shown
            ALWAYS (independent of the liquidation-notifications flag and of BTC
            price), and decoupled from the cascade banner so a stale-price or
            all-pending position still surfaces it. */}
        <MaxVaultsNotification connectedAddress={address} />

        {liquidationNotificationsEnabled && (
          <PositionNotificationBanner
            connectedAddress={address}
            onDeposit={openDeposit}
            onRepay={handleRepay}
            result={debugResultOverride ?? undefined}
            statusOverride={debugStatusOverride ?? undefined}
          />
        )}

        <OverviewSection
          healthFactor={healthFactor}
          healthFactorStatus={healthFactorStatus}
          totalCollateralValue={totalCollateralValue}
          totalBorrowed={totalBorrowed}
          liquidationPrice={liquidationPrice}
          btcPrice={btcPrice}
          pctToLiquidation={pctToLiquidation}
        />

        <PendingDepositSection />

        <PendingWithdrawSection
          pendingWithdrawVaults={inProgressWithdrawVaults}
          pegoutStatuses={withdrawPegoutStatuses}
        />

        <PendingWithdrawSection
          title={COPY.pegout.section.completedTitle}
          pendingWithdrawVaults={completedWithdrawVaults}
          pegoutStatuses={withdrawPegoutStatuses}
        />

        <CollateralSection
          totalAmountBtc={totalAmountBtcShown}
          collateralVaults={collateralVaultsWithDemo}
          hasCollateral={showCollateral}
          isConnected={isConnected}
          collateralBtc={collateralBtcShown}
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
      </div>

      {/* Withdraw Flow.
          Safety invariant: this MUST receive the raw on-chain `collateralVaults`,
          never `collateralVaultsWithDemo`. WithdrawFlow signs a real withdraw
          transaction, so passing the demo-merged list would let a god-mode mock
          row (fake vaultId) — or a hidden-real scenario — enter the real signing
          path. The CollateralSection above is the only surface that takes the
          demo-merged list, and it filters `displayOnly` rows out of every action.
          WithdrawFlow also filters `displayOnly` internally as defense-in-depth. */}
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

      {godModePanel}
    </Container>
  );
}
