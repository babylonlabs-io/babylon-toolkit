import { Hint } from "@babylonlabs-io/core-ui";

export interface MarketStat {
  label: string;
  value: string;
  /** Renders a core-ui <Hint> after the label when set. */
  tooltip?: string;
}

export function MarketStatsBar({ stats }: { stats: MarketStat[] }) {
  return (
    <div
      className="flex flex-wrap items-start gap-6"
      data-testid="market-stats-bar"
    >
      {stats.map((stat) => (
        <div key={stat.label} className="flex w-[172px] flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary">
              {stat.label}
            </span>
            {stat.tooltip ? <Hint tooltip={stat.tooltip} /> : null}
          </div>
          <span className="text-2xl leading-[1.334] text-accent-primary">
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}
