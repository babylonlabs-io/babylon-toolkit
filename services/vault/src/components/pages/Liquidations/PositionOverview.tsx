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
        actionLabel: COPY.liquidations.position.repay,
        onAction: onRepay,
      },
      {
        label: COPY.liquidations.position.healthFactor,
        tooltip: COPY.tooltips.healthFactor,
        value: healthFactorText,
        valueNode: (
          <span className="flex items-center gap-2">
            {healthFactorText}
            <HeartIcon color={healthFactorColor} />
          </span>
        ),
      },
    ],
    [
      collateralBtc,
      collateralValueUsd,
      debtUsd,
      healthFactorText,
      healthFactorColor,
      onDeposit,
      onRepay,
    ],
  );

  return <PositionStatCards cards={cards} />;
}
