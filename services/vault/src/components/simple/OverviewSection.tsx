/**
 * OverviewSection Component
 * Displays overview information: a liquidation-risk gauge with liquidation
 * price / BTC price / % to liquidation stats, plus Health Factor, Total
 * Collateral Value, and Total Borrowed rows. Rendered only while a wallet is
 * connected; the disconnected entry screen is handled by DashboardPage.
 */

import { Heading, Hint, InfoIcon, useIsMobile } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import {
  formatHealthFactor,
  getHealthFactorColor,
  HEALTH_FACTOR_HEALTHY_THRESHOLD,
  type HealthFactorStatus,
} from "@/applications/aave/utils";
import {
  HealthFactorGauge,
  HeartIcon,
  type HealthFactorGaugeStat,
} from "@/components/shared";
import { FeatureFlags } from "@/config";
import { COPY } from "@/copy";

import { PositionStatCards, type PositionStatCard } from "./PositionStatCards";

interface OverviewSectionProps {
  healthFactor: number | null;
  healthFactorStatus: HealthFactorStatus;
  totalCollateralValue: string;
  totalBorrowed: string;
  liquidationPrice: string;
  btcPrice: string;
  pctToLiquidation: string;
  availableToBorrow: string;
  collateralBtc: string;
  availableMeterPercent: number;
  borrowedMeterPercent: number;
  borrowCapacityLoading: boolean;
  borrowCapacityError: Error | null;
  onDeposit: () => void;
  onBorrow: () => void;
  onRepay: () => void;
  canBorrow: boolean;
  canRepay: boolean;
}

interface OverviewRowProps {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}

function OverviewRow({ label, tooltip, children }: OverviewRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
        {tooltip ? (
          <Hint
            tooltip={tooltip}
            icon={<InfoIcon size={16} className="text-accent-secondary" />}
          >
            {label}
          </Hint>
        ) : (
          label
        )}
      </span>
      <span className="flex items-center gap-2 text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
        {children}
      </span>
    </div>
  );
}

export function OverviewSection({
  healthFactor,
  healthFactorStatus,
  totalCollateralValue,
  totalBorrowed,
  liquidationPrice,
  btcPrice,
  pctToLiquidation,
  availableToBorrow,
  collateralBtc,
  availableMeterPercent,
  borrowedMeterPercent,
  borrowCapacityLoading,
  borrowCapacityError,
  onDeposit,
  onBorrow,
  onRepay,
  canBorrow,
  canRepay,
}: OverviewSectionProps) {
  const isMobile = useIsMobile();
  // v3 desktop replaces this in-page heading with the persistent header's
  // page title; v3 mobile has no header title slot (Header only shows it on
  // desktop), so the heading must stay to avoid a page with no title at all.
  const hideHeading = FeatureFlags.isV3UiEnabled && !isMobile;
  const healthFactorFormatted =
    healthFactor !== null && healthFactor > HEALTH_FACTOR_HEALTHY_THRESHOLD
      ? COPY.overview.healthFactorHealthy
      : formatHealthFactor(healthFactor);
  const healthFactorColor = getHealthFactorColor(healthFactorStatus);
  const showHealthFactor = healthFactor !== null;

  const gaugeStats: HealthFactorGaugeStat[] = useMemo(
    () => [
      { label: COPY.overview.liquidationPriceLabel, value: liquidationPrice },
      { label: COPY.overview.btcPriceLabel, value: btcPrice },
      { label: COPY.overview.pctToLiquidationLabel, value: pctToLiquidation },
    ],
    [liquidationPrice, btcPrice, pctToLiquidation],
  );

  const statCards: PositionStatCard[] = useMemo(() => {
    const clampPct = (ratio: number) =>
      Math.round(Math.min(1, Math.max(0, ratio)) * 100);
    const capacityUnavailable =
      borrowCapacityLoading || borrowCapacityError != null;
    return [
      {
        label: COPY.overview.totalCollateralValueLabel,
        tooltip: COPY.overview.totalCollateralValueTooltip,
        value: totalCollateralValue,
        caption: collateralBtc,
        actionLabel: COPY.overview.depositAction,
        onAction: onDeposit,
        actionDisabled: false,
      },
      {
        label: COPY.overview.availableToBorrowLabel,
        value: borrowCapacityLoading
          ? COPY.common.loading
          : borrowCapacityError
            ? COPY.common.emptyValue
            : availableToBorrow,
        meter: capacityUnavailable
          ? undefined
          : {
              percent: availableMeterPercent,
              label: COPY.overview.availableMeterLabel(
                clampPct(availableMeterPercent),
              ),
            },
        actionLabel: COPY.overview.borrowAction,
        onAction: onBorrow,
        actionDisabled: !canBorrow,
      },
      {
        label: COPY.overview.totalBorrowedLabel,
        value: totalBorrowed,
        meter: capacityUnavailable
          ? undefined
          : {
              percent: borrowedMeterPercent,
              label: COPY.overview.borrowedMeterLabel(
                clampPct(borrowedMeterPercent),
              ),
            },
        actionLabel: COPY.overview.repayAction,
        onAction: onRepay,
        actionDisabled: !canRepay,
      },
    ];
  }, [
    totalCollateralValue,
    collateralBtc,
    onDeposit,
    availableToBorrow,
    availableMeterPercent,
    borrowCapacityLoading,
    borrowCapacityError,
    onBorrow,
    canBorrow,
    totalBorrowed,
    borrowedMeterPercent,
    onRepay,
    canRepay,
  ]);

  return (
    <div className="w-full space-y-6">
      {!hideHeading && (
        <div className="flex items-center justify-between">
          <Heading
            variant="h5"
            as="h2"
            className="font-normal text-accent-primary"
          >
            {COPY.overview.heading}
          </Heading>
        </div>
      )}

      {FeatureFlags.isV3UiEnabled ? (
        <div className="space-y-2">
          <Heading
            variant="h6"
            as="h2"
            className="font-normal text-accent-primary"
          >
            {COPY.overview.positionTitle}
          </Heading>
          <PositionStatCards cards={statCards} />
        </div>
      ) : (
        <div className="w-full rounded-2xl bg-secondary-highlight p-6">
          <div className="space-y-4">
            {/* Liquidation-risk gauge with stats */}
            {showHealthFactor && (
              <HealthFactorGauge
                value={healthFactor}
                status={healthFactorStatus}
                stats={gaugeStats}
              />
            )}

            {/* Health Factor Row */}
            <OverviewRow
              label={COPY.overview.healthFactorLabel}
              tooltip={COPY.overview.healthFactorTooltip}
            >
              {showHealthFactor ? (
                <>
                  <HeartIcon color={healthFactorColor} />
                  {healthFactorFormatted}
                </>
              ) : (
                COPY.common.emptyValue
              )}
            </OverviewRow>

            {/* Total Collateral Value Row */}
            <OverviewRow
              label={COPY.overview.totalCollateralValueLabel}
              tooltip={COPY.overview.totalCollateralValueTooltip}
            >
              {totalCollateralValue}
            </OverviewRow>

            {/* Total Borrowed Row */}
            <OverviewRow label={COPY.overview.totalBorrowedLabel}>
              {totalBorrowed}
            </OverviewRow>
          </div>
        </div>
      )}
    </div>
  );
}
