import { twJoin } from "tailwind-merge";

import { COPY } from "@/copy";

import type { LiquidationEventCard } from "./liquidationChartData";

const ROW_CLASS =
  "flex items-center justify-between gap-4 text-sm leading-[1.43] tracking-[0.17px]";

function MetricRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className={ROW_CLASS}>
      <span className="text-accent-secondary">{label}</span>
      <span className={twJoin("text-accent-primary", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

function SectionCaption({ children }: { children: string }) {
  return (
    <span className="mt-2 text-xs uppercase leading-[1.5] tracking-[0.4px] text-accent-secondary">
      {children}
    </span>
  );
}

function EventCard({
  card,
  liquidated,
}: {
  card: LiquidationEventCard;
  liquidated: boolean;
}) {
  const badgeLabel =
    card.badge === "sacrificial"
      ? COPY.liquidations.events.badgeSacrificial
      : COPY.liquidations.events.badgeProtected;

  return (
    <article
      className={twJoin(
        "flex flex-col gap-2 rounded-lg border p-4",
        liquidated ? "border-error-main" : "border-secondary-strokeLight",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
          {card.title}
        </span>
        {liquidated ? (
          <span className="rounded-full bg-error-main/10 px-2.5 py-0.5 text-xs text-error-main">
            {COPY.liquidations.events.liquidatedInSimulation}
          </span>
        ) : (
          <span
            className={twJoin(
              "rounded-full px-2.5 py-0.5 text-xs",
              card.badge === "sacrificial"
                ? "bg-warning-main/10 text-warning-main"
                : "bg-secondary-highlight text-accent-secondary",
            )}
          >
            {badgeLabel}
          </span>
        )}
      </div>

      <MetricRow
        label={COPY.liquidations.events.collateral}
        value={card.collateralLabel}
      />
      <MetricRow
        label={COPY.liquidations.events.liqPrice}
        value={card.liqPriceLabel}
      />
      <MetricRow
        label={COPY.liquidations.events.distance}
        value={card.distanceLabel}
        valueClassName={card.distanceNegative ? "text-error-main" : undefined}
      />

      <SectionCaption>
        {COPY.liquidations.events.seizedVaultsSection}
      </SectionCaption>
      {card.seizedVaults.map((vault) => (
        <MetricRow
          key={vault.name}
          label={vault.name}
          value={vault.amountLabel}
        />
      ))}
      <MetricRow
        label={COPY.liquidations.events.targetSeizure}
        value={card.targetSeizureLabel}
      />
      <MetricRow
        label={COPY.liquidations.events.overSeizure}
        value={card.overSeizureLabel}
      />

      <SectionCaption>
        {COPY.liquidations.events.estimatedLiquidationSection}
      </SectionCaption>
      <MetricRow
        label={COPY.liquidations.events.collateralLiquidated}
        value={card.collateralLiquidatedLabel}
      />
      <MetricRow
        label={COPY.liquidations.events.debtRepaid}
        value={card.debtRepaidLabel}
      />
      <MetricRow
        label={COPY.liquidations.events.liquidatorProfit}
        value={card.liquidatorProfitLabel}
      />
      <MetricRow label={card.fairness.label} value={card.fairness.value} />

      <SectionCaption>
        {COPY.liquidations.events.positionAfterSection}
      </SectionCaption>
      <MetricRow
        label={COPY.liquidations.events.btcRemaining}
        value={card.btcRemainingLabel}
      />
      <MetricRow
        label={COPY.liquidations.events.debtRemaining}
        value={card.debtRemainingLabel}
      />
      <MetricRow
        label={COPY.liquidations.events.hfAfterLiquidation}
        value={card.hfAfterLabel}
      />
    </article>
  );
}

export function LiquidationEventCards({
  cards,
  liquidatedKeys,
  simulating,
}: {
  cards: LiquidationEventCard[];
  /** Band keys currently read as liquidated (shared with the chart bands). */
  liquidatedKeys: ReadonlySet<string>;
  /** The liquidated treatment only applies while a simulation is active. */
  simulating: boolean;
}) {
  return (
    <div
      className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3"
      data-testid="liq-event-cards"
    >
      {cards.map((card) => (
        <EventCard
          key={card.key}
          card={card}
          liquidated={simulating && liquidatedKeys.has(card.key)}
        />
      ))}
    </div>
  );
}
