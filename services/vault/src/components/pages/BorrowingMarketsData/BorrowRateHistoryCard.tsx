/**
 * Borrow-APR history card (C3, Figma node 10088-61052). Range selection is
 * local, ephemeral state (D6) — it never persists across visits.
 */

import { Hint, LineChart, type ChartAxisTick } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";

import { useBorrowRateHistory } from "@/applications/aave/hooks";
import type {
  BorrowRateHistoryPoint,
  HistoryRange,
} from "@/clients/indexer/aaveHistoryClient";
import { COPY } from "@/copy";
import { formatAprPercent } from "@/utils/formatting";

import {
  fittedRateDomain,
  hasSubDailySpacing,
  historyTooltipDate,
  rateTicks,
} from "./borrowChartData";

/** Figma's card chrome: `bg-background-secondary rounded-2xl`, pt-6/px-6/pb-10, 24px gap. */
const CARD_CLASS =
  "flex w-full flex-col gap-6 rounded-2xl bg-background-secondary pt-6 px-6 pb-10";
/** Frame's plot box is 1070x156 (see the C3 LineChart mapping table). */
const CHART_ASPECT_RATIO = 1070 / 156;
/** The frame shows 3 horizontal gridlines. */
const Y_TICK_COUNT = 3;

const ACTIVE_RANGE_CLASS =
  "rounded-lg bg-background-contrast px-2 py-0.5 text-accent-primary";
const INACTIVE_RANGE_CLASS = "px-2 py-0.5 text-accent-secondary";

const DEFAULT_RANGE: HistoryRange = "1w";
const RANGE_OPTIONS: HistoryRange[] = ["1d", "1w", "1m", "6m", "1y", "all"];

function rangeLabel(range: HistoryRange): string {
  const { ranges } = COPY.marketData.charts;
  switch (range) {
    case "1d":
      return ranges.d1;
    case "1w":
      return ranges.w1;
    case "1m":
      return ranges.m1;
    case "6m":
      return ranges.m6;
    case "1y":
      return ranges.y1;
    case "all":
      return ranges.all;
  }
}

/** Range over the loaded series; a single figure (no dash) when it's flat. */
function headerFigure(points: BorrowRateHistoryPoint[]): string {
  const rates = points.map((p) => p.ratePercent);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  return min === max
    ? formatAprPercent(min)
    : COPY.marketData.charts.rateRange(
        formatAprPercent(min),
        formatAprPercent(max),
      );
}

function CardShell({
  range,
  onRangeChange,
  value,
  children,
}: {
  range: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
  /** The big header figure — grouped 4px below the caption-label row (Figma header block). */
  value?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={CARD_CLASS} data-testid="borrow-rate-history-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary">
              {COPY.marketData.charts.borrowAprLabel}
            </span>
            <Hint tooltip={COPY.loans.borrowAprTooltip} />
          </div>
          {value}
        </div>
        <div className="flex items-center gap-1">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === range}
              data-testid={`history-range-${option}`}
              onClick={() => onRangeChange(option)}
              className={`text-xs leading-[1.66] tracking-[0.4px] ${
                option === range ? ACTIVE_RANGE_CLASS : INACTIVE_RANGE_CLASS
              }`}
            >
              {rangeLabel(option)}
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

function CenteredMessage({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-12">
      <span className="text-accent-secondary">{message}</span>
    </div>
  );
}

export function BorrowRateHistoryCard({
  reserveId,
  symbol,
}: {
  reserveId: bigint;
  symbol: string;
}) {
  const [range, setRange] = useState<HistoryRange>(DEFAULT_RANGE);
  const { points, isLoading, error } = useBorrowRateHistory({
    reserveId,
    range,
  });

  // Hooks run before the early returns below (rules-of-hooks), so these
  // memos tolerate the null/empty states those returns handle — the
  // fallback values are never rendered, since those branches bail before
  // reaching the chart.
  const chartData = useMemo(
    () => points?.map((p) => ({ x: p.timeMs, y: p.ratePercent })) ?? [],
    [points],
  );

  const domain = useMemo<[number, number]>(
    () => (points && points.length > 0 ? fittedRateDomain(points) : [0, 0]),
    [points],
  );

  const yTicks = useMemo<ChartAxisTick[]>(
    () => (points && points.length > 0 ? rateTicks(domain, Y_TICK_COUNT) : []),
    [points, domain],
  );

  // The tooltip shows the time whenever the served buckets are sub-daily —
  // the indexer's `resolution=auto` decides that, not the range button.
  const tooltipWithTime = useMemo(
    () => (points !== null ? hasSubDailySpacing(points) : false),
    [points],
  );

  if (isLoading) {
    return (
      <CardShell range={range} onRangeChange={setRange}>
        <CenteredMessage message={COPY.common.loading} />
      </CardShell>
    );
  }

  if (error || points === null) {
    return (
      <CardShell range={range} onRangeChange={setRange}>
        <CenteredMessage message={COPY.marketData.charts.chartUnavailable} />
      </CardShell>
    );
  }

  if (points.length === 0) {
    return (
      <CardShell range={range} onRangeChange={setRange}>
        <CenteredMessage message={COPY.marketData.charts.historyEmpty} />
      </CardShell>
    );
  }

  return (
    <CardShell
      range={range}
      onRangeChange={setRange}
      value={
        <span
          data-testid="borrow-rate-history-figure"
          className="text-2xl leading-[1.334] text-accent-primary"
        >
          {headerFigure(points)}
        </span>
      }
    >
      <LineChart
        data={chartData}
        interpolation="step"
        yDomain={domain}
        yTicks={yTicks}
        aspectRatio={CHART_ASPECT_RATIO}
        grid={{ lines: "horizontal", style: "solid" }}
        hoverMode="nearest"
        renderTooltip={(hover) => (
          <>
            <div>{historyTooltipDate(hover.point.x, tooltipWithTime)}</div>
            <div>{formatAprPercent(hover.point.y)}</div>
          </>
        )}
        ariaLabel={COPY.marketData.charts.historyAriaLabel(symbol)}
        color="currentColor"
        className="text-accent-primary"
      />
    </CardShell>
  );
}
