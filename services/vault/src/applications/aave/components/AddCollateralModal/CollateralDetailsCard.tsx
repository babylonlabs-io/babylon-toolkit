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
  getHealthFactorColor,
  getHealthFactorStatusFromValue,
} from "../../utils/healthFactor";

interface CollateralDetailsCardProps {
  /** Current health factor value (Infinity when no debt) */
  currentHealthFactorValue: number;
  /** Projected health factor value after adding collateral (Infinity when no debt) */
  projectedHealthFactorValue: number;
  /** Whether to show the before → after transition */
  showTransition?: boolean;
}

export function CollateralDetailsCard({
  currentHealthFactorValue,
  projectedHealthFactorValue,
  showTransition = false,
}: CollateralDetailsCardProps) {
  const { borrowableReserves } = useAaveConfig();

  const currentStatus = getHealthFactorStatusFromValue(
    currentHealthFactorValue,
  );
  const currentColor = getHealthFactorColor(currentStatus);
  const currentFormatted = formatHealthFactor(
    isFinite(currentHealthFactorValue) ? currentHealthFactorValue : null,
  );

  const projectedStatus = getHealthFactorStatusFromValue(
    projectedHealthFactorValue,
  );
  const projectedColor = getHealthFactorColor(projectedStatus);
  const projectedFormatted = formatHealthFactor(
    isFinite(projectedHealthFactorValue) ? projectedHealthFactorValue : null,
  );

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
      <div className="divide-y divide-secondary-strokeLight">
        {/* Spoke Row */}
        <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
          <span className="text-sm text-accent-secondary">Spoke</span>
          <span className="text-base text-accent-primary">Aave Prime</span>
        </div>

        {/* Borrowable Assets Row */}
        <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
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
        <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
          <span className="text-sm text-accent-secondary">Health Factor</span>
          {showTransition ? (
            <span className="flex items-center gap-2 text-base">
              <span className="flex items-center gap-1 text-accent-secondary">
                <HeartIcon color={currentColor} />
                {currentFormatted}
              </span>
              <span className="text-accent-secondary">→</span>
              <span className="flex items-center gap-1 text-accent-primary">
                <HeartIcon color={projectedColor} />
                {projectedFormatted}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-base text-accent-primary">
              <HeartIcon color={projectedColor} />
              {projectedFormatted}
            </span>
          )}
        </div>
      </div>
    </SubSection>
  );
}
