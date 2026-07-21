/**
 * ActiveLoansList Component
 * v3 Loans page "Active Loans (N)" section: one row per borrowed asset showing
 * amount, live Borrow APR, available liquidity and utilization, with per-asset
 * Borrow / Repay entry points into the existing reserve-detail overlay.
 */

import { Avatar, Heading } from "@babylonlabs-io/core-ui";

import type { ActiveLoanRow } from "@/applications/aave/hooks";
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
        {label}
      </span>
      <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
        {value}
      </span>
    </div>
  );
}

// Filled action button matching the summary's Borrow/Repay (see
// PositionStatCards' StatSection button) so both button groups look identical,
// per the v3 design.
function RowActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 items-center justify-center rounded-lg bg-secondary-strokeLight px-6 text-base leading-[1.5] tracking-[0.15px] text-accent-primary transition-[filter] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:text-accent-disabled"
    >
      {label}
    </button>
  );
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

      <div className="overflow-hidden rounded-lg bg-secondary-highlight">
        {rows.map((row, index) => {
          const availableLiquidity =
            row.availableLiquidity !== null
              ? `${formatCompactTokenAmount(row.availableLiquidity)} ${row.symbol}`
              : COPY.common.emptyValue;
          const utilization =
            row.utilizationBps !== null
              ? formatBasisPointsAsPercent(row.utilizationBps)
              : COPY.common.emptyValue;

          return (
            <div
              key={row.reserveId}
              className={`flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between ${
                index > 0
                  ? "border-t border-secondary-strokeLight dark:border-secondary-strokeDark"
                  : ""
              }`}
            >
              <div className="flex shrink-0 items-center gap-2 lg:min-w-[200px]">
                <Avatar url={row.icon} alt={row.symbol} size="medium" />
                <span className="whitespace-nowrap text-xl text-accent-primary">
                  {row.amount} {row.symbol}
                </span>
              </div>

              <div className="flex flex-wrap gap-6 lg:flex-1 lg:justify-start">
                <Metric
                  label={COPY.loans.borrowRateLabel}
                  value={row.borrowRate ?? COPY.common.emptyValue}
                />
                <Metric
                  label={COPY.loans.availableLiquidityLabel}
                  value={availableLiquidity}
                />
                <Metric
                  label={COPY.loans.utilizationLabel}
                  value={utilization}
                />
              </div>

              <div className="flex flex-shrink-0 gap-3">
                <RowActionButton
                  label={COPY.loans.borrowButton}
                  onClick={() => onBorrow(row.symbol)}
                  disabled={!canBorrow}
                />
                <RowActionButton
                  label={COPY.loans.repayButton}
                  onClick={() => onRepay(row.symbol)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
