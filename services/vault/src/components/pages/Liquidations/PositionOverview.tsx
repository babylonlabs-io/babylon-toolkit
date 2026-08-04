import { useMemo } from "react";

import {
  formatHealthFactor,
  getHealthFactorColor,
  type HealthFactorStatus,
} from "@/applications/aave/utils";
// Direct module import, not the `shared` barrel: the barrel drags in the whole
// shared component tree for one icon.
import { HeartIcon } from "@/components/shared/icons/HeartIcon";
import {
  PositionStatCards,
  type PositionStatCard,
} from "@/components/simple/PositionStatCards";
import { COPY } from "@/copy";
import { formatBtcAmount, formatUsd } from "@/utils/formatting";

interface PositionOverviewProps {
  collateralBtc: number;
  /** `null` when no BTC price is available to price the override — an absent
   *  caption, not a fabricated "$0.00 USD". */
  collateralValueUsd: number | null;
  debtUsd: number;
  /** Debt as a share of the maximum borrowable, [0,1]. */
  borrowedRatio: number;
  /** `null` before debt exists — mirrors `useDashboardState`'s live shape. */
  healthFactor: number | null;
  healthFactorStatus: HealthFactorStatus;
  onDeposit: () => void;
  onRepay: () => void;
}

export function PositionOverview({
  collateralBtc,
  collateralValueUsd,
  debtUsd,
  borrowedRatio,
  healthFactor,
  healthFactorStatus,
  onDeposit,
  onRepay,
}: PositionOverviewProps) {
  const healthFactorColor = getHealthFactorColor(healthFactorStatus);
  const healthFactorText =
    healthFactor !== null
      ? formatHealthFactor(healthFactor)
      : COPY.common.emptyValue;

  const cards: PositionStatCard[] = useMemo(
    () => [
      {
        label: COPY.liquidations.position.totalCollateralValue,
        tooltip: COPY.overview.totalCollateralValueTooltip,
        value: formatBtcAmount(collateralBtc),
        caption:
          collateralValueUsd !== null
            ? `${formatUsd(collateralValueUsd)} USD`
            : undefined,
        actionLabel: COPY.liquidations.position.deposit,
        onAction: onDeposit,
      },
      {
        label: COPY.liquidations.position.totalBorrowed,
        value: `${formatUsd(debtUsd)} USD`,
        meter: {
          percent: borrowedRatio,
          label: COPY.overview.borrowedMeterLabel(
            Math.round(Math.min(1, Math.max(0, borrowedRatio)) * 100),
          ),
        },
        actionLabel: COPY.liquidations.position.repay,
        onAction: onRepay,
      },
      {
        label: COPY.liquidations.position.healthFactor,
        tooltip: COPY.overview.healthFactorTooltip,
        value: healthFactorText,
        valueNode: (
          <span className="flex items-center gap-2">
            {healthFactorText}
            <HeartIcon color={healthFactorColor} />
          </span>
        ),
        caption: COPY.risk.healthFactorDescription,
      },
    ],
    [
      collateralBtc,
      collateralValueUsd,
      debtUsd,
      borrowedRatio,
      healthFactorText,
      healthFactorColor,
      onDeposit,
      onRepay,
    ],
  );

  return <PositionStatCards cards={cards} />;
}
