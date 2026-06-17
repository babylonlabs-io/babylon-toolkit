import { Hint, SubSection } from "@babylonlabs-io/core-ui";

import {
  getHealthFactorColor,
  getHealthFactorStatusFromValue,
} from "@/applications/aave/utils";
import { HeartIcon } from "@/components/shared";
import { COPY } from "@/copy";

interface BorrowMetricsCardProps {
  /** Formatted current available liquidity, or "–". */
  availableLiquidity: string;
  /**
   * Formatted post-borrow available liquidity. When set, the row shows
   * `current → projected`; omit it to show the current value alone.
   */
  availableLiquidityProjected?: string;
  /** Formatted current borrow APR (live from the Aave Hub), or "–". */
  borrowApr: string;
  /** Formatted utilization percentage (borrowed / supplied), or "–". */
  utilization: string;
  healthFactor: string;
  healthFactorValue: number;
  healthFactorOriginal?: string;
  healthFactorOriginalValue?: number;
}

const ROW_CLASS = "flex w-full items-center justify-between text-sm";
const DIVIDER_CLASS = "h-px w-full bg-secondary-strokeLight";

/**
 * Borrow metrics card. Borrow APR, Available liquidity, and Utilization all
 * show live values read from the Aave Hub for the selected reserve; Health
 * factor uses its real projected value. Each figure falls back to the empty
 * placeholder ("–") while its read is loading or unavailable rather than
 * rendering a fabricated value. (The projected post-borrow rate is not a simple
 * read, so only the current borrow APR is shown.)
 */
export function BorrowMetricsCard({
  availableLiquidity,
  availableLiquidityProjected,
  borrowApr,
  utilization,
  healthFactor,
  healthFactorValue,
  healthFactorOriginal,
  healthFactorOriginalValue,
}: BorrowMetricsCardProps) {
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
    <SubSection className="flex-col gap-4 !bg-secondary-highlight">
      <div className={ROW_CLASS}>
        <span className="text-accent-secondary">
          {COPY.loans.availableLiquidityLabel}
        </span>
        {availableLiquidityProjected ? (
          <span className="flex items-center gap-2 text-accent-primary">
            <span className="text-accent-secondary">{availableLiquidity}</span>
            <span className="text-accent-secondary">
              {COPY.common.valueTransitionArrow}
            </span>
            <span>{availableLiquidityProjected}</span>
          </span>
        ) : (
          <span className="text-accent-primary">{availableLiquidity}</span>
        )}
      </div>

      <div className={DIVIDER_CLASS} />

      <div className={ROW_CLASS}>
        <div className="flex items-center gap-1 text-accent-secondary">
          {COPY.loans.borrowRateLabel}
          <Hint tooltip={COPY.loans.borrowAprTooltip} />
        </div>
        <span className="text-accent-primary">{borrowApr}</span>
      </div>

      <div className={ROW_CLASS}>
        <div className="flex items-center gap-1 text-accent-secondary">
          {COPY.loans.utilizationLabel}
          <Hint tooltip={COPY.loans.utilizationTooltip} />
        </div>
        <span className="text-accent-primary">{utilization}</span>
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
              <span className="text-accent-secondary">
                {COPY.common.valueTransitionArrow}
              </span>
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
