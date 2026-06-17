import { Hint, SubSection } from "@babylonlabs-io/core-ui";

import {
  getHealthFactorColor,
  getHealthFactorStatusFromValue,
} from "@/applications/aave/utils";
import { HeartIcon } from "@/components/shared";
import { COPY } from "@/copy";

interface BorrowMetricsCardProps {
  /** Formatted current borrow APR (live from the Aave Hub), or "–". */
  borrowApr: string;
  healthFactor: string;
  healthFactorValue: number;
  healthFactorOriginal?: string;
  healthFactorOriginalValue?: number;
}

const ROW_CLASS = "flex w-full items-center justify-between text-sm";
const DIVIDER_CLASS = "h-px w-full bg-secondary-strokeLight";

/**
 * Borrow metrics card. Borrow APR shows the live current rate (Aave Hub drawn
 * rate); Health factor uses its real projected value. Available liquidity and
 * Utilization have no frontend data source yet, so they render the empty
 * placeholder ("–") rather than a fabricated figure — a follow-up PR wires
 * those (and the projected post-borrow rate) once the reserve totals are read.
 */
export function BorrowMetricsCard({
  borrowApr,
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
        <span className="text-accent-primary">{COPY.common.emptyValue}</span>
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
        <span className="text-accent-primary">{COPY.common.emptyValue}</span>
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
