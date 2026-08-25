import { Hint } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";
import { twJoin } from "tailwind-merge";

import { COPY } from "@/copy";

import type { LiquidationEventCard as EventCardData } from "./liquidationChartData";

/**
 * Per-event breakdown card (Figma node 10251:64809). Purely presentational —
 * every value arrives pre-formatted from `buildLiquidationChartData`.
 *
 * The top rule carries the event's identity, matching the band's colour lane
 * in the chart.
 */

const TONE_BORDER: Record<EventCardData["tone"], string> = {
  "1": "border-t-[var(--liq-band-1)]",
  "2": "border-t-[var(--liq-band-2)]",
  "3": "border-t-[var(--liq-band-3)]",
};

const SECTION_TITLE_CLASS =
  "text-base uppercase leading-[1.5] tracking-[0.15px] text-accent-secondary";
const ROW_CLASS = "flex w-full items-center justify-between text-sm";
const DIVIDER_CLASS = "h-px w-full bg-secondary-strokeLight";
// `Hint` renders a block-level wrapper, so a label that carries one must be a
// block element itself.
const HINTED_LABEL_CLASS = "flex items-center gap-1";

function DetailRow({
  label,
  value,
  labelClassName,
  tooltip,
}: {
  label: string;
  value: string;
  labelClassName?: string;
  tooltip?: string;
}) {
  return (
    <div className={ROW_CLASS}>
      <div
        className={twJoin(
          HINTED_LABEL_CLASS,
          "text-accent-primary",
          labelClassName,
        )}
      >
        {label}
        {tooltip ? <Hint tooltip={tooltip} /> : null}
      </div>
      <span className="text-accent-primary">{value}</span>
    </div>
  );
}

function Stat({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
        {label}
      </span>
      <span className={twJoin("leading-[1.6] tracking-[0.15px]", className)}>
        {children}
      </span>
    </div>
  );
}

function SeizureRow({
  label,
  amount,
  unit,
  emphasis,
  tooltip,
}: {
  label: string;
  amount: string;
  unit: string;
  emphasis?: boolean;
  tooltip?: string;
}) {
  return (
    <div
      className={twJoin(
        "flex w-full items-center justify-between px-3 py-2",
        !emphasis &&
          "border-t border-secondary-strokeLight bg-background-contrast",
      )}
    >
      <div
        className={twJoin(
          HINTED_LABEL_CLASS,
          emphasis
            ? "text-base leading-[1.5] tracking-[0.15px] text-accent-primary"
            : "text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary",
        )}
      >
        {label}
        {tooltip ? <Hint tooltip={tooltip} /> : null}
      </div>
      <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
        {amount} <span className="text-accent-secondary">{unit}</span>
      </span>
    </div>
  );
}

export function LiquidationEventCard({ card }: { card: EventCardData }) {
  const { triggered } = card;

  return (
    <article
      className={twJoin(
        "flex flex-col gap-4 rounded-lg border-t-4 bg-background-secondary p-6",
        TONE_BORDER[card.tone],
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xl leading-[1.6] tracking-[0.15px] text-accent-primary">
          {card.title}
        </h3>
      </div>

      <div className="flex gap-16">
        <Stat
          label={COPY.liquidations.events.collateral}
          className="text-xl text-accent-primary"
        >
          {card.collateralLabel}
        </Stat>
        <Stat
          label={COPY.liquidations.events.liqPrice}
          className={twJoin(
            "text-xl",
            triggered ? "text-error-light" : "text-success-light",
          )}
        >
          {card.liqPriceLabel}
        </Stat>
        <Stat
          label={COPY.liquidations.events.distance}
          className={twJoin(
            "text-xl",
            triggered ? "text-error-light" : "text-success-light",
          )}
        >
          {card.distanceLabel}
        </Stat>
      </div>

      <div className="flex flex-col gap-2">
        <p className={SECTION_TITLE_CLASS}>
          {COPY.liquidations.events.seizedVaultsSection}
        </p>
        <div className="overflow-hidden rounded-lg border border-secondary-strokeLight">
          {card.seizedVaults.map((vault) => (
            <SeizureRow
              key={vault.name}
              label={vault.name}
              amount={vault.amount}
              unit={vault.unit}
              emphasis
            />
          ))}
          <SeizureRow
            label={COPY.liquidations.events.targetSeizure}
            tooltip={COPY.liquidations.events.targetSeizureTooltip}
            amount={card.targetSeizure.amount}
            unit={card.targetSeizure.unit}
          />
          <SeizureRow
            label={COPY.liquidations.events.overSeizure}
            tooltip={COPY.liquidations.events.overSeizureTooltip}
            amount={card.overSeizure.amount}
            unit={card.overSeizure.unit}
          />
        </div>
      </div>

      <div className={DIVIDER_CLASS} />

      <div className="flex flex-col gap-2">
        <p className={SECTION_TITLE_CLASS}>
          {COPY.liquidations.events.estimatedLiquidationSection}
        </p>
        <div className="flex flex-col gap-2">
          <DetailRow
            label={COPY.liquidations.events.collateralLiquidated}
            value={card.collateralLiquidatedLabel}
          />
          <DetailRow
            label={COPY.liquidations.events.debtRepaid}
            value={card.debtRepaidLabel}
            labelClassName="text-warning-main"
          />
          <DetailRow
            label={COPY.liquidations.events.liquidatorProfit}
            value={card.liquidatorProfitLabel}
          />
          <DetailRow
            label={card.fairness.label}
            value={card.fairness.value}
            tooltip={card.fairness.tooltip}
            labelClassName="text-info-light"
          />
        </div>
      </div>

      <div className={DIVIDER_CLASS} />

      <div className="flex flex-col gap-2">
        <p className={SECTION_TITLE_CLASS}>
          {COPY.liquidations.events.positionAfterSection}
        </p>
        <div className="flex gap-16">
          <Stat
            label={COPY.liquidations.events.btcRemaining}
            className="text-base text-accent-primary"
          >
            {card.btcRemainingLabel}
          </Stat>
          <Stat
            label={COPY.liquidations.events.debtRemaining}
            className="text-base text-accent-primary"
          >
            {card.debtRemainingLabel}
          </Stat>
          <Stat
            label={COPY.liquidations.events.hfAfterLiquidation}
            className="text-base text-risk-amber"
          >
            {card.hfAfterLabel}
          </Stat>
        </div>
      </div>
    </article>
  );
}
