/**
 * OverviewCard Component
 * Displays overview information including Collateral Value and Health Factor
 */

import { Card } from "@babylonlabs-io/core-ui";

import {
  formatHealthFactor,
  getHealthFactorColor,
  type HealthFactorStatus,
} from "@/applications/aave/utils";
import { HeartIcon } from "@/components/shared";
import { useConnection } from "@/context/wallet";

interface OverviewCardProps {
  collateralAmount: string;
  collateralValue: string;
  /** Health factor value from Aave (null if no debt or loading) */
  healthFactor: number | null;
  /** Health factor status for display */
  healthFactorStatus: HealthFactorStatus;
}

export function OverviewCard({
  collateralAmount,
  collateralValue,
  healthFactor,
  healthFactorStatus,
}: OverviewCardProps) {
  const { isConnected } = useConnection();
  const healthFactorFormatted = formatHealthFactor(healthFactor);
  const healthFactorColor = getHealthFactorColor(healthFactorStatus);

  // Show placeholder values when not connected
  const displayAmount = isConnected ? collateralAmount : "--";
  const displayValue = isConnected
    ? collateralValue.replace(/ USD$/, "")
    : "--";
  const displayHealthFactor = isConnected ? healthFactorFormatted : "--";

  return (
    <Card className="w-full">
      <div className="w-full space-y-6">
        <h2 className="text-[24px] font-normal text-accent-primary">
          Overview
        </h2>

        <div className="space-y-4">
          {/* Collateral Value Row */}
          <div className="flex items-center justify-between border-b border-secondary-strokeLight pb-4">
            <span className="text-sm text-accent-secondary">
              Collateral Value
            </span>
            <span className="text-base text-accent-primary">
              {displayAmount} ({displayValue})
            </span>
          </div>

          {/* Health Factor Row */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-accent-secondary">Health Factor</span>
            <span className="flex items-center gap-2 text-base text-accent-primary">
              {isConnected && <HeartIcon color={healthFactorColor} />}
              {displayHealthFactor}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
