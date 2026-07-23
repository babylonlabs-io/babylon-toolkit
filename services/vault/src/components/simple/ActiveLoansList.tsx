/**
 * ActiveLoansList Component
 * v3 Loans page "Active Loans (N)" section: one row per borrowed asset showing
 * amount, live Borrow APR, available liquidity and utilization, with per-asset
 * Borrow / Repay entry points into the existing reserve-detail overlay.
 */

import { Avatar, Heading } from "@babylonlabs-io/core-ui";

import type { ActiveLoanRow } from "@/applications/aave/hooks";
import { ListRowCard, ListRowMetric } from "@/components/shared/ListRow";
import { NEUTRAL_ROW_BUTTON_CLASS } from "@/components/shared/buttonClasses";
import { COPY } from "@/copy";
import {
  formatBasisPointsAsPercent,
  formatCompactTokenAmount,
} from "@/utils/formatting";

interface ActiveLoansListProps {
  rows: ActiveLoanRow[];
  /** Whether there is remaining borrow capacity (disables per-row Borrow at 0). */
  canBorrow: boolean;
  onBorrow: (symbol: string) => void;
  onRepay: (symbol: string) => void;
}

export function ActiveLoansList({
  rows,
  canBorrow,
  onBorrow,
  onRepay,
}: ActiveLoansListProps) {
  return (
    <div className="w-full space-y-4">
      <Heading variant="h6" as="h2" className="font-normal text-accent-primary">
        {COPY.loans.activeLoansHeading(rows.length)}
      </Heading>

      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const availableLiquidity =
            row.availableLiquidity !== null
              ? `${formatCompactTokenAmount(row.availableLiquidity)} ${row.symbol}`
              : COPY.common.emptyValue;
          const utilization =
            row.utilizationBps !== null
              ? formatBasisPointsAsPercent(row.utilizationBps)
              : COPY.common.emptyValue;

          return (
            <ListRowCard key={row.reserveId}>
              <div className="flex w-[200px] shrink-0 items-center gap-2">
                <Avatar url={row.icon} alt={row.symbol} size="medium" />
                <span className="truncate text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
                  {row.amount} {row.symbol}
                </span>
              </div>

              <ListRowMetric
                label={COPY.loans.borrowRateLabel}
                value={row.borrowRate ?? COPY.common.emptyValue}
              />
              <ListRowMetric
                label={COPY.loans.availableLiquidityLabel}
                value={availableLiquidity}
              />
              <ListRowMetric
                label={COPY.loans.utilizationLabel}
                value={utilization}
              />

              <div className="ml-auto flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => onBorrow(row.symbol)}
                  disabled={!canBorrow || !row.isBorrowable}
                  className={NEUTRAL_ROW_BUTTON_CLASS}
                >
                  {COPY.loans.borrowButton}
                </button>
                <button
                  type="button"
                  onClick={() => onRepay(row.symbol)}
                  className={NEUTRAL_ROW_BUTTON_CLASS}
                >
                  {COPY.loans.repayButton}
                </button>
              </div>
            </ListRowCard>
          );
        })}
      </div>
    </div>
  );
}
