/**
 * OverviewCard Component
 * Displays overview information including Collateral Value and Health Factor
 */

import { Card } from "@babylonlabs-io/core-ui";
import { HeartIcon } from "@/components/shared";
import { isHealthFactorHealthy } from "@/applications/aave/utils";

interface OverviewCardProps {
  collateralAmount: string;
  collateralValue: string;
  healthFactor: string;
}

export function OverviewCard({
  collateralAmount,
  collateralValue,
  healthFactor,
}: OverviewCardProps) {
  const isHealthy = isHealthFactorHealthy(healthFactor);

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
              {collateralAmount} ({collateralValue.replace(/ USD$/, "")})
            </span>
          </div>

          {/* Health Factor Row */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-accent-secondary">
              Health Factor
            </span>
            <span className="flex items-center gap-2 text-base text-accent-primary">
              <HeartIcon isHealthy={isHealthy} />
              {healthFactor}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

