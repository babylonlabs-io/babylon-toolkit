/**
 * OverviewSection Component
 * Displays overview information: a liquidation-risk gauge with liquidation
 * price / BTC price / % to liquidation stats, plus Health Factor, Total
 * Collateral Value, and Total Borrowed rows. Rendered only while a wallet is
 * connected; the disconnected entry screen is handled by DashboardPage.
 */

import { Hint, InfoIcon } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import {
  formatHealthFactor,
  getHealthFactorColor,
  HEALTH_FACTOR_HEALTHY_THRESHOLD,
  type HealthFactorStatus,
} from "@/applications/aave/utils";
import {
  HealthFactorGauge,
  type HealthFactorGaugeStat,
  HeartIcon,
} from "@/components/shared";
import { CARD_DARK_BG_CLASS } from "@/components/shared/layoutClasses";
import { COPY } from "@/copy";

interface OverviewSectionProps {
  healthFactor: number | null;
  healthFactorStatus: HealthFactorStatus;
  totalCollateralValue: string;
  totalBorrowed: string;
  liquidationPrice: string;
  btcPrice: string;
  pctToLiquidation: string;
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
}: OverviewSectionProps) {
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

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-normal text-accent-primary">
          {COPY.overview.heading}
        </h2>
      </div>

      <div
        className={`w-full rounded-2xl bg-secondary-highlight p-6 ${CARD_DARK_BG_CLASS}`}
      >
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
    </div>
  );
}
