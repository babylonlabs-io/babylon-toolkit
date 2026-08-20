/**
 * DashboardPage Component
 * Composes all dashboard sections into the main dashboard view.
 * Wires real data from Aave hooks and navigation to deposit/borrow/repay flows.
 */

import { Container } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import { useOutletContext } from "react-router";

import { useSyncPendingVaults } from "@/applications/aave/context";
import { useAaveVaults } from "@/applications/aave/hooks";
import { usePositionNotifications } from "@/applications/aave/hooks/usePositionNotifications";
import type { RootLayoutContext } from "@/components/pages/RootLayout";
import {
  ENTRY_CONTENT_CLASS,
  PAGE_CONTENT_CLASS,
} from "@/components/shared/layoutClasses";
import { isDepositBlocked } from "@/components/shared/protocolStatus";
import featureFlags from "@/config/featureFlags";
import { useConnection, useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { useApplicationCap } from "@/hooks/useApplicationCap";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useLoanActions } from "@/hooks/useLoanActions";
import { usePrices } from "@/hooks/usePrices";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import {
  resolveShownHealthFactor,
  useHealthFactorOverride,
} from "@/overrides/borrowCapacity";
import {
  resolveLiquidationCardState,
  useLiquidationCardOverride,
} from "@/overrides/liquidations";
import { usePositionCascadeOverride } from "@/overrides/position";
import {
  formatBasisPointsAsPercent,
  formatBtcAmount,
  formatLiquidationDistancePercent,
  formatUsdPrice,
  formatUsdValue,
} from "@/utils/formatting";

import { CriticalLiquidationTopBanner } from "./CriticalLiquidationTopBanner";
import { DisconnectedOverview } from "./DisconnectedOverview";
import { LiquidationAnalysisSection } from "./LiquidationAnalysisSection";
import { MaxVaultsNotification } from "./MaxVaultsNotification";
import { OverviewSection } from "./OverviewSection";
import { PositionNotificationBanner } from "./PositionNotificationBanner";
import { RiskSection } from "./RiskSection";

export function DashboardPage() {
  const { openDeposit } = useOutletContext<RootLayoutContext>();
  const { address } = useETHWallet();
  const { isConnected } = useConnection();
  const gate = useProtocolGateState();

  // Dev-only banner override driven by the position-notifications section of
  // the god-mode panel (see @/overrides/position). Always null in production,
  // so the banners fall back to the live calculation with no behavioural
  // change.
  const cascadeOverride = usePositionCascadeOverride();
  const liquidationCardOverride = useLiquidationCardOverride();
  // No live source yet: the chart renders only from the god-mode cascade,
  // behind its own flag. Elsewhere it stays absent rather than charting a real
  // position from placeholder numbers.
  const liquidationCascade = useMemo(
    () =>
      featureFlags.isLiquidationAnalysisChartEnabled && cascadeOverride?.result
        ? {
            result: cascadeOverride.result,
            btcPrice: cascadeOverride.params.btcPrice,
            collateralFactor: cascadeOverride.params.CF,
            vaultsTotal: cascadeOverride.params.vaults.length,
          }
        : null,
    [cascadeOverride],
  );
  const {
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    maxTotalDebtUsd,
    availableToBorrowUsd,
    canBorrow,
    collateralFactorBps,
    healthFactor,
    healthFactorStatus,
    borrowedAssets,
    hasLoans,
    hasCollateral,
    hasDisplayCollateral,
    isBorrowCapacityLoading,
    borrowCapacityError,
  } = useDashboardState(isConnected ? address : undefined);

  const { openBorrowPicker, openRepay } = useLoanActions({
    borrowedAssets,
  });

  const { snapshot: capSnapshot, error: capError } = useApplicationCap(
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
  const criticalBannerResult = cascadeOverride?.result ?? positionNotifications;

  const { vaults: aaveVaults } = useAaveVaults(
    isConnected ? address : undefined,
  );

  // Sync pending vault operations (add/withdraw) with indexer data
  useSyncPendingVaults(aaveVaults);

  // Format display values
  const totalCollateralValue = formatUsdValue(collateralValueUsd);
  const totalBorrowed = formatUsdValue(debtValueUsd);
  const availableToBorrow = formatUsdValue(availableToBorrowUsd);
  const collateralBtcText = formatBtcAmount(collateralBtc);
  // The Overview is purely a financial summary: an empty position renders every
  // row as a placeholder ("Health factor –", "$0 USD", "$0 USD"), so suppress
  // the whole panel until there is real collateral or debt to summarize. Gate on
  // the financial flags (not the display ones) so an optimistic "activating"
  // vault, whose values are still $0, doesn't surface an empty panel.
  const hasOverviewData = hasCollateral || hasLoans;
  const liquidationCardState = resolveLiquidationCardState(
    liquidationCardOverride,
    { hasCollateral: hasDisplayCollateral, hasLoans },
  );

  const availableMeterPercent =
    maxTotalDebtUsd > 0 ? availableToBorrowUsd / maxTotalDebtUsd : 0;
  const borrowedMeterPercent =
    maxTotalDebtUsd > 0 ? debtValueUsd / maxTotalDebtUsd : 0;

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
  const usableBtcPriceUsd =
    isBtcPriceUsable && btcPriceUsd !== undefined && btcPriceUsd > 0
      ? btcPriceUsd
      : null;
  const btcPrice =
    usableBtcPriceUsd !== null
      ? formatUsdPrice(usableBtcPriceUsd)
      : COPY.common.emptyValue;
  // God-mode override (dev only; null in production). Health factor is
  // btcPrice / liquidationPrice, so a forced value implies the liquidation
  // price that produces it — the rail is charted from that price, not the HF.
  // A forced card is derived wholesale from the override: with no usable BTC
  // price there is nothing to imply a liquidation price from, and the stats
  // read as placeholders rather than mixing a forced HF with live liquidation
  // numbers (the case you hit inspecting the stale-price path).
  const healthFactorOverride = useHealthFactorOverride();
  const {
    healthFactor: shownHealthFactor,
    healthFactorStatus: shownHealthFactorStatus,
  } = resolveShownHealthFactor(
    healthFactorOverride,
    healthFactor,
    healthFactorStatus,
  );
  const forcedLiquidationPriceUsd =
    healthFactorOverride !== null && usableBtcPriceUsd !== null
      ? usableBtcPriceUsd / healthFactorOverride
      : null;
  const liquidationPriceUsd =
    healthFactorOverride !== null
      ? forcedLiquidationPriceUsd
      : (firstLiquidationGroup?.liquidationPrice ?? null);
  const liquidationPrice =
    liquidationPriceUsd !== null
      ? formatUsdPrice(liquidationPriceUsd)
      : COPY.common.emptyValue;
  const distanceToLiquidationPct =
    healthFactorOverride !== null
      ? forcedLiquidationPriceUsd !== null
        ? 100 * (1 - 1 / healthFactorOverride)
        : null
      : firstLiquidationGroup !== null
        ? -firstLiquidationGroup.distancePct
        : null;
  const pctToLiquidation =
    distanceToLiquidationPct !== null
      ? formatLiquidationDistancePercent(distanceToLiquidationPct)
      : COPY.common.emptyValue;
  const collateralFactorText =
    collateralFactorBps !== null
      ? formatBasisPointsAsPercent(collateralFactorBps)
      : COPY.common.emptyValue;

  // The cascade banner sits between the Position and Risk sections (Figma
  // 10204-45310).
  const cascadeBanner = liquidationNotificationsEnabled ? (
    <PositionNotificationBanner
      connectedAddress={address}
      onDeposit={openDeposit}
      onRepay={openRepay}
      result={cascadeOverride?.result ?? undefined}
      statusOverride={cascadeOverride?.status ?? undefined}
    />
  ) : null;

  if (!isConnected) {
    return (
      // `my-auto` completes the Container's built-in `mx-auto` to a full
      // `margin: auto`, vertically centering the disconnected landing screen in
      // the remaining viewport height.
      <Container className={`${ENTRY_CONTENT_CLASS} my-auto pb-6`}>
        <DisconnectedOverview capSnapshot={capSnapshot} capError={capError} />
      </Container>
    );
  }

  return (
    <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
      <div className="space-y-10">
        {/* Notifications sit above Overview per Figma (frame 6508-114810). The
            critical top banner, the max-vaults notice, and the cascade banner
            share this slot. */}
        {liquidationNotificationsEnabled && (
          <CriticalLiquidationTopBanner result={criticalBannerResult} />
        )}

        {/* "Maximum vaults reached" is a value-protection capacity fact shown
            ALWAYS (independent of the liquidation-notifications flag and of BTC
            price), and decoupled from the cascade banner so a stale-price or
            all-pending position still surfaces it. */}
        <MaxVaultsNotification connectedAddress={address} />

        <OverviewSection
          totalCollateralValue={totalCollateralValue}
          totalBorrowed={totalBorrowed}
          availableToBorrow={availableToBorrow}
          collateralBtc={collateralBtcText}
          availableMeterPercent={availableMeterPercent}
          borrowCapacityLoading={isBorrowCapacityLoading}
          borrowCapacityError={borrowCapacityError}
          borrowedMeterPercent={borrowedMeterPercent}
          onDeposit={openDeposit}
          isDepositDisabled={isDepositBlocked(gate)}
          onBorrow={openBorrowPicker}
          onRepay={openRepay}
          canBorrow={canBorrow}
          canRepay={hasLoans}
        />

        {cascadeBanner}

        <RiskSection
          healthFactor={shownHealthFactor}
          healthFactorStatus={shownHealthFactorStatus}
          hasPosition={hasOverviewData || healthFactorOverride !== null}
          liquidationPriceText={liquidationPrice}
          btcPriceText={btcPrice}
          pctToLiquidationText={pctToLiquidation}
          collateralFactorText={collateralFactorText}
          collateralFactorLoading={isBorrowCapacityLoading}
          btcPriceUsd={usableBtcPriceUsd}
          liquidationPriceUsd={liquidationPriceUsd}
        />

        <LiquidationAnalysisSection
          hasCollateral={liquidationCardState.hasCollateral}
          hasLoans={liquidationCardState.hasLoans}
          onDeposit={openDeposit}
          onBorrow={openBorrowPicker}
          cascade={liquidationCascade}
        />
      </div>
    </Container>
  );
}
