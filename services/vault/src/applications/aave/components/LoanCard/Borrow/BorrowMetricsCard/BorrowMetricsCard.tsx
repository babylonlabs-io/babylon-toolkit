import { Hint, SubSection } from "@babylonlabs-io/core-ui";

import {
  getHealthFactorColor,
  getHealthFactorStatusFromValue,
} from "@/applications/aave/utils";
import { HeartIcon } from "@/components/shared";
import { COPY } from "@/copy";

import { BORROW_METRIC_PLACEHOLDERS } from "../borrowMetricPlaceholders";

interface BorrowMetricsCardProps {
  hasProjection: boolean;
  symbol: string;
  healthFactor: string;
  healthFactorValue: number;
  healthFactorOriginal?: string;
  healthFactorOriginalValue?: number;
}

const ROW_CLASS = "flex w-full items-center justify-between text-sm";
const DIVIDER_CLASS = "h-px w-full bg-secondary-strokeLight";

export function BorrowMetricsCard({
  hasProjection,
  symbol,
  healthFactor,
  healthFactorValue,
  healthFactorOriginal,
  healthFactorOriginalValue,
}: BorrowMetricsCardProps) {
  const { availableLiquidity, borrowApy, utilization } =
    BORROW_METRIC_PLACEHOLDERS;

  const status = getHealthFactorStatusFromValue(healthFactorValue);
  const color = getHealthFactorColor(status);
  const originalStatus =
    healthFactorOriginalValue !== undefined
      ? getHealthFactorStatusFromValue(healthFactorOriginalValue)
      : undefined;
  const originalColor = originalStatus
    ? getHealthFactorColor(originalStatus)
    : undefined;

  return (
    <SubSection className="flex-col gap-4">
      <div className={ROW_CLASS}>
        <span className="text-accent-secondary">
          {COPY.loans.availableLiquidityLabel}
        </span>
        <span className="flex items-center gap-1 text-accent-primary">
          {hasProjection ? (
            <>
              <span className="text-accent-secondary">{`${availableLiquidity.current} →`}</span>
              <span>{`${availableLiquidity.projected} ${symbol}`}</span>
            </>
          ) : (
            `${availableLiquidity.current} ${symbol}`
          )}
        </span>
      </div>

      <div className={DIVIDER_CLASS} />

      <div className={ROW_CLASS}>
        <div className="flex items-center gap-1 text-accent-secondary">
          {COPY.loans.borrowRateLabel}
          <Hint tooltip={COPY.loans.borrowApyTooltip} />
        </div>
        <span className="flex items-center gap-1 text-accent-primary">
          {hasProjection ? (
            <>
              <span className="text-accent-secondary">{`${borrowApy.current} →`}</span>
              <span>{borrowApy.projected}</span>
            </>
          ) : (
            borrowApy.current
          )}
        </span>
      </div>

      <div className={ROW_CLASS}>
        <div className="flex items-center gap-1 text-accent-secondary">
          {COPY.loans.utilizationLabel}
          <Hint tooltip={COPY.loans.utilizationTooltip} />
        </div>
        <span className="flex items-center gap-1 text-accent-primary">
          {hasProjection ? (
            <>
              <span className="text-accent-secondary">{`${utilization.current} →`}</span>
              <span>{utilization.projected}</span>
            </>
          ) : (
            utilization.current
          )}
        </span>
      </div>

      <div className={DIVIDER_CLASS} />

      <div className={ROW_CLASS}>
        <div className="flex items-center gap-1 text-accent-secondary">
          {COPY.loans.healthFactorLabel}
          <Hint tooltip={COPY.loans.healthFactorTooltip} />
        </div>
        <span className="flex items-center gap-2 text-accent-primary">
          {healthFactorOriginal && originalColor ? (
            <>
              <span className="flex items-center gap-1 text-accent-secondary">
                <HeartIcon color={originalColor} />
                {healthFactorOriginal}
              </span>
              <span className="text-accent-secondary">→</span>
              <span className="flex items-center gap-1">
                <HeartIcon color={color} />
                {healthFactor}
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1">
              <HeartIcon color={color} />
              {healthFactor}
            </span>
          )}
        </span>
      </div>
    </SubSection>
  );
}
