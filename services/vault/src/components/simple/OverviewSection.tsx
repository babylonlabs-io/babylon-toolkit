/**
 * OverviewSection Component
 * Displays overview information including Health Factor, Total Collateral Value, and Amount to Repay
 */

import { Avatar, Card } from "@babylonlabs-io/core-ui";

import {
  formatHealthFactor,
  getHealthFactorColor,
  type HealthFactorStatus,
} from "@/applications/aave/utils";
import { HealthFactorGauge, HeartIcon } from "@/components/shared";

interface OverviewSectionProps {
  healthFactor: number | null;
  healthFactorStatus: HealthFactorStatus;
  totalCollateralValue: string;
  amountToRepay: string;
  isConnected: boolean;
}

export function OverviewSection({
  healthFactor,
  healthFactorStatus,
  totalCollateralValue,
  amountToRepay,
  isConnected,
}: OverviewSectionProps) {
  const healthFactorFormatted = formatHealthFactor(healthFactor);
  const healthFactorColor = getHealthFactorColor(healthFactorStatus);

  const displayCollateral = isConnected ? totalCollateralValue : "--";
  const displayRepay = isConnected ? amountToRepay : "--";
  const showHealthFactor = isConnected && healthFactor !== null;

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-normal text-accent-primary">
          Overview
        </h2>
        <Avatar
          url="/images/aave.svg"
          alt="Aave"
          size="small"
          className="h-8 w-8 !rounded-full"
        />
      </div>

      <Card variant="filled" className="w-full">
        <div className="space-y-4">
          {/* Health Factor Row */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-accent-secondary">Health factor</span>
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

          {/* Health Factor Gauge */}
          {showHealthFactor && (
            <HealthFactorGauge
              value={healthFactor}
              status={healthFactorStatus}
            />
          )}

          {/* Total Collateral Value Row */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-accent-secondary">
              Total Collateral Value
            </span>
            <span className="text-base text-accent-primary">
              {displayCollateral}
            </span>
          </div>

          {/* Amount to Repay Row */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-accent-secondary">
              Amount to repay
            </span>
            <span className="text-base text-accent-primary">
              {displayRepay}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
