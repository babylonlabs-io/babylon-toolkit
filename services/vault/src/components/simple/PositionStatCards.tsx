import { Hint, InfoIcon } from "@babylonlabs-io/core-ui";
import { Fragment } from "react";

export interface PositionStatCard {
  label: string;
  tooltip?: string;
  value: string;
  caption?: string;
  meter?: {
    percent: number;
    label: string;
  };
  actionLabel: string;
  onAction: () => void;
  actionDisabled: boolean;
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

        <span className="text-xl leading-[1.6] tracking-[0.15px] text-accent-primary">
          {card.value}
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

      <button
        type="button"
        onClick={() => card.onAction()}
        disabled={card.actionDisabled}
        className="flex h-10 w-[120px] shrink-0 items-center justify-center rounded-lg bg-secondary-strokeLight text-base leading-[1.5] tracking-[0.15px] text-accent-primary transition-[filter] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:text-accent-disabled"
      >
        {card.actionLabel}
      </button>
    </div>
  );
}

export function PositionStatCards({ cards }: { cards: PositionStatCard[] }) {
  return (
    <div className="rounded-lg bg-secondary-highlight p-6 dark:bg-[#202020]">
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
