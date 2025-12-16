/**
 * CollateralDetailsCard Component
 * Displays Spoke, borrowable assets, and health factor in the Add Collateral modal
 */

import { Avatar, AvatarGroup, SubSection } from "@babylonlabs-io/core-ui";

import { HeartIcon } from "@/components/shared";
import { getTokenByAddress } from "@/services/token";

import { useAaveConfig } from "../../context";
import {
  formatHealthFactor,
  isHealthFactorHealthy,
} from "../../utils/healthFactor";

interface CollateralDetailsCardProps {
  /** Projected health factor after adding collateral */
  healthFactor: number | null;
}

export function CollateralDetailsCard({
  healthFactor,
}: CollateralDetailsCardProps) {
  const { borrowableReserves } = useAaveConfig();

  const isHealthy = isHealthFactorHealthy(healthFactor);
  const healthFactorFormatted = formatHealthFactor(healthFactor);

  // Get icons for borrowable assets
  const borrowableAssetIcons = borrowableReserves.map((reserve) => {
    const tokenMetadata = getTokenByAddress(reserve.token.address);
    return {
      address: reserve.token.address,
      symbol: reserve.token.symbol,
      icon: tokenMetadata?.icon,
    };
  });

  return (
    <SubSection>
      <div className="space-y-4">
        {/* Spoke Row */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-accent-secondary">Spoke</span>
          <span className="text-base text-accent-primary">Aave Prime</span>
        </div>

        {/* Borrowable Assets Row */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-accent-secondary">
            Borrowable assets
          </span>
          <AvatarGroup size="small" max={5} variant="circular">
            {borrowableAssetIcons.map((asset) => (
              <Avatar
                key={asset.address}
                url={asset.icon}
                alt={asset.symbol}
                size="small"
              />
            ))}
          </AvatarGroup>
        </div>

        {/* Health Factor Row */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-accent-secondary">Health Factor</span>
          <span className="flex items-center gap-2 text-base text-accent-primary">
            <HeartIcon isHealthy={isHealthy} />
            {healthFactorFormatted}
          </span>
        </div>
      </div>
    </SubSection>
  );
}
