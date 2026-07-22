import { Hint, InfoIcon } from "@babylonlabs-io/core-ui";
import { Fragment, type ReactNode } from "react";

import { COPY } from "@/copy";
import { formatMeterLabel } from "@/utils/formatting";

export interface PositionStatCard {
  label: string;
  tooltip?: string;
  value: string;
  /** Custom value rendering (e.g. colored health factor + heart). Overrides
   *  `value` when set; `value` is still used for accessibility fallbacks. */
  valueNode?: ReactNode;
  caption?: string;
  meter?: {
    percent: number;
    label: string;
  };
  /** Action button. Omit all three to render a card with no button. */
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  /** Optional test hook for the action button (E2E real-wallet CLI). */
  actionTestId?: string;
}

function StatMeter({
  percent,
  label,
  ariaLabel,
}: {
  percent: number;
  label: string;
  ariaLabel: string;
}) {
  const clamped = Math.max(0, Math.min(1, percent));
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        className="h-1 w-[68px] overflow-hidden rounded-full bg-secondary-strokeLight"
      >
        <div
          className="h-full rounded-full bg-secondary-main"
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
      <span className="whitespace-nowrap text-xs leading-[1.66] tracking-[0.4px] text-accent-primary">
        {label}
      </span>
    </div>
  );
}

function StatSection({ card }: { card: PositionStatCard }) {
  const hasAction = card.actionLabel != null && card.onAction != null;
  return (
    <div className="flex flex-1 items-center justify-between gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1 text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
          {card.tooltip ? (
            <Hint
              tooltip={card.tooltip}
              icon={<InfoIcon size={16} className="text-accent-secondary" />}
            >
              <span className="text-accent-secondary">{card.label}</span>
            </Hint>
          ) : (
            card.label
          )}
        </div>

        <span className="flex items-center gap-2 text-xl leading-[1.6] tracking-[0.15px] text-accent-primary">
          {card.valueNode ?? card.value}
        </span>

        {card.meter ? (
          <StatMeter
            percent={card.meter.percent}
            label={card.meter.label}
            ariaLabel={card.label}
          />
        ) : card.caption ? (
          <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
            {card.caption}
          </span>
        ) : null}
      </div>

      {hasAction && (
        <button
          type="button"
          onClick={() => card.onAction?.()}
          disabled={card.actionDisabled}
          data-testid={card.actionTestId}
          className="flex h-10 w-[120px] shrink-0 items-center justify-center rounded-lg bg-secondary-strokeLight text-base leading-[1.5] tracking-[0.15px] text-accent-primary transition-[filter] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:text-accent-disabled"
        >
          {card.actionLabel}
        </button>
      )}
    </div>
  );
}

export function PositionStatCards({ cards }: { cards: PositionStatCard[] }) {
  return (
    <div className="rounded-lg bg-secondary-highlight p-6">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-stretch">
        {cards.map((card, index) => (
          <Fragment key={card.label}>
            {index > 0 && (
              <div className="h-px w-full self-center bg-secondary-strokeLight xl:h-16 xl:w-px" />
            )}
            <StatSection card={card} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/**
 * Builds the two borrow-capacity summary cards — "Available to borrow" and
 * "Total borrowed" — shared by the Overview position summary and the Loans
 * page. Keeps the meter-label branching (near-full / below-one) single-sourced.
 */
export function buildBorrowCapacityCards({
  availableToBorrow,
  availableMeterPercent,
  totalBorrowed,
  borrowedMeterPercent,
  borrowCapacityLoading,
  borrowCapacityError,
  onBorrow,
  onRepay,
  canBorrow,
  canRepay,
  borrowTestId,
  repayTestId,
}: {
  availableToBorrow: string;
  availableMeterPercent: number;
  totalBorrowed: string;
  borrowedMeterPercent: number;
  borrowCapacityLoading: boolean;
  borrowCapacityError: Error | null;
  onBorrow: () => void;
  onRepay: () => void;
  canBorrow: boolean;
  canRepay: boolean;
  /** Optional E2E test hooks for the borrow / repay action buttons. */
  borrowTestId?: string;
  repayTestId?: string;
}): PositionStatCard[] {
  const capacityUnavailable =
    borrowCapacityLoading || borrowCapacityError != null;

  const availableValue = borrowCapacityLoading
    ? COPY.common.loading
    : borrowCapacityError
      ? COPY.common.emptyValue
      : availableToBorrow;

  return [
    {
      label: COPY.overview.availableToBorrowLabel,
      value: availableValue,
      meter: capacityUnavailable
        ? undefined
        : {
            percent: availableMeterPercent,
            label: formatMeterLabel(availableMeterPercent, {
              belowOne: COPY.overview.availableMeterBelowOneLabel,
              nearFull: COPY.overview.availableMeterNearFullLabel,
              exact: COPY.overview.availableMeterLabel,
            }),
          },
      actionLabel: COPY.overview.borrowAction,
      onAction: onBorrow,
      actionDisabled: !canBorrow,
      actionTestId: borrowTestId,
    },
    {
      label: COPY.overview.totalBorrowedLabel,
      value: totalBorrowed,
      meter: capacityUnavailable
        ? undefined
        : {
            percent: borrowedMeterPercent,
            label: formatMeterLabel(borrowedMeterPercent, {
              belowOne: COPY.overview.borrowedMeterBelowOneLabel,
              nearFull: COPY.overview.borrowedMeterNearFullLabel,
              exact: COPY.overview.borrowedMeterLabel,
            }),
          },
      actionLabel: COPY.overview.repayAction,
      onAction: onRepay,
      actionDisabled: !canRepay,
      actionTestId: repayTestId,
    },
  ];
}
