/**
 * CollateralDetailsCard Component
 * Displays Spoke, borrowable assets (add mode only), debt (withdraw mode only), and health factor
 */

import { Avatar, AvatarGroup, SubSection } from "@babylonlabs-io/core-ui";

import { HeartIcon } from "@/components/shared";
import { getTokenByAddress } from "@/services/token";
import { formatUsdValue } from "@/utils/formatting";

import { useAaveConfig } from "../../context";
import {
  formatHealthFactor,
  getHealthFactorColor,
  getHealthFactorStatusFromValue,
} from "../../utils/healthFactor";

import type { CollateralMode } from "./CollateralModal";

interface CollateralDetailsCardProps {
  /** Modal mode - "add" shows borrowable assets, "withdraw" shows debt */
  mode: CollateralMode;
  /** Current health factor value (Infinity when no debt) */
  currentHealthFactorValue: number;
  /** Projected health factor value after adding/withdrawing collateral (Infinity when no debt) */
  projectedHealthFactorValue: number;
  /** Whether to show the before → after transition */
  showTransition?: boolean;
  /** Current debt value in USD (for withdraw mode) */
  currentDebtValueUsd?: number;
}

export function CollateralDetailsCard({
  mode,
  currentHealthFactorValue,
  projectedHealthFactorValue,
  showTransition = false,
  currentDebtValueUsd,
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

  // Get icons for borrowable assets (only needed for add mode)
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

        {/* Borrowable Assets Row - only shown in add mode */}
        {mode === "add" && (
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
        )}

        {/* Current Debt Row - only shown in withdraw mode */}
        {mode === "withdraw" && currentDebtValueUsd !== undefined && (
          <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
            <span className="text-sm text-accent-secondary">Current Debt</span>
            <span className="text-base text-accent-primary">
              {formatUsdValue(currentDebtValueUsd)}
            </span>
          </div>
        )}

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
