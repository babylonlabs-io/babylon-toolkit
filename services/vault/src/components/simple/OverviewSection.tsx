/**
 * OverviewSection Component
 * Displays overview information including Health Factor, Total Collateral
 * Value, and Amount to Repay. Rendered only while a wallet is connected; the
 * disconnected entry screen is handled by DashboardPage.
 */

import { Heading } from "@babylonlabs-io/core-ui";

import {
  formatHealthFactor,
  getHealthFactorColor,
  HEALTH_FACTOR_HEALTHY_THRESHOLD,
  type HealthFactorStatus,
} from "@/applications/aave/utils";
import { HealthFactorGauge, HeartIcon } from "@/components/shared";
import { COPY } from "@/copy";

interface OverviewSectionProps {
  healthFactor: number | null;
  healthFactorStatus: HealthFactorStatus;
  totalCollateralValue: string;
  amountToRepay: string;
  ltv: string;
}

export function OverviewSection({
  healthFactor,
  healthFactorStatus,
  totalCollateralValue,
  amountToRepay,
  ltv,
}: OverviewSectionProps) {
  const healthFactorFormatted =
    healthFactor !== null && healthFactor > HEALTH_FACTOR_HEALTHY_THRESHOLD
      ? COPY.overview.healthFactorHealthy
      : formatHealthFactor(healthFactor);
  const healthFactorColor = getHealthFactorColor(healthFactorStatus);
  const showHealthFactor = healthFactor !== null;

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <Heading
          variant="h5"
          as="h2"
          className="font-normal text-accent-primary"
        >
          {COPY.overview.heading}
        </Heading>
      </div>

      <div className="w-full rounded-2xl bg-secondary-highlight p-6">
        <div className="space-y-4">
          {/* Health Factor Gauge */}
          {showHealthFactor && (
            <HealthFactorGauge
              value={healthFactor}
              status={healthFactorStatus}
            />
          )}

          {/* Health Factor Row */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-accent-secondary">
              {COPY.overview.healthFactorLabel}
            </span>
            <span className="flex items-center gap-2 text-base text-accent-primary">
              {showHealthFactor ? (
                <>
                  <HeartIcon color={healthFactorColor} />
                  {healthFactorFormatted}
                </>
              ) : (
                "-"
              )}
            </span>
          </div>

          {/* Current LTV Row */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-accent-secondary">
              {COPY.overview.ltvLabel}
            </span>
            <span className="text-base text-accent-primary">
              {showHealthFactor ? ltv : "-"}
            </span>
          </div>

          {/* Total Collateral Value Row */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-accent-secondary">
              {COPY.overview.totalCollateralValueLabel}
            </span>
            <span className="text-base text-accent-primary">
              {totalCollateralValue}
            </span>
          </div>

          {/* Amount to Repay Row */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-accent-secondary">
              {COPY.overview.amountToRepayLabel}
            </span>
            <span className="text-base text-accent-primary">
              {amountToRepay}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
