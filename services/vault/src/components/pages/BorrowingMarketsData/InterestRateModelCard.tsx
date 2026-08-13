/**
 * C2 — the interest-rate-model chart (Figma node 10088-61091). One curve:
 * on-chain borrow APR against utilization, with the kink (optimal usage) and
 * the reserve's live utilization called out. The header row also carries the
 * frame's "Borrow APR / Utilization Rate" legend, top right — utilization is
 * still the marker, not a second series; the legend just labels the curve's
 * color and the shared marker color for the callouts.
 */

import {
  Hint,
  LineChart,
  type ChartAxisTick,
  type LineChartMarker,
} from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { useInterestRateModelCurve } from "@/applications/aave/hooks";
import type { AaveReserveConfig } from "@/applications/aave/services/fetchConfig";
import { COPY } from "@/copy";
import {
  formatAprPercent,
  formatBasisPointsAsPercent,
} from "@/utils/formatting";

import { aprAtUtilization, percentAxis } from "./borrowChartData";

/** Theme tokens (globals.css) shared by the chart marks and the legend dots
 *  so they can never drift apart. LineChart pipes the `var()` references into
 *  its CSS custom properties, so they resolve per theme; the dot classes are
 *  the same tokens as Tailwind arbitrary values. */
const MARKER_COLOR = "var(--chart-irm-marker)";
const SERIES_COLOR = "var(--chart-irm-series)";
const MARKER_DOT_CLASS = "bg-[color:var(--chart-irm-marker)]";
const SERIES_DOT_CLASS = "bg-[color:var(--chart-irm-series)]";
/** Frame plot box is 1070×228 (`10088:61091`). */
const CHART_ASPECT_RATIO = 1070 / 228;
/** Frame's x-axis labels row. */
const X_TICK_VALUES = [0, 25, 50, 75, 100];
const X_TICKS: ChartAxisTick[] = X_TICK_VALUES.map((value) => ({
  value,
  label: `${value}%`,
}));
/** Utilization always spans the full 0–100% axis. */
const X_DOMAIN: [number, number] = [0, 100];
/** Frame shows 5 rows of y-axis ticks. */
const Y_TICK_COUNT = 5;
/** BPS per whole percentage point (1% = 100 BPS). */
const BPS_PER_PERCENT = 100;

const CARD_CLASS =
  "flex w-full flex-col gap-6 rounded-2xl bg-background-secondary pt-6 px-6 pb-10";
/** Shared by every caption in the card (label row, legend entries). */
const CAPTION_CLASS =
  "text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary";

/** Utilization percents from the hook are plain 0–100 numbers — round to a
 *  whole percent for the callout text ("Current 68%", "Optimal (Kink) 80%"). */
function formatWholeUtilizationPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}

function LegendDot({ colorClass }: { colorClass: string }) {
  return <span className={`size-3 rounded-full ${colorClass}`} />;
}

/** Top-right header legend (Figma's "Borrow APR / Utilization Rate" pair). */
function Legend() {
  return (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-2">
        <LegendDot colorClass={SERIES_DOT_CLASS} />
        <span className={CAPTION_CLASS}>
          {COPY.marketData.charts.borrowAprLabel}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <LegendDot colorClass={MARKER_DOT_CLASS} />
        <span className={CAPTION_CLASS}>
          {COPY.marketData.charts.utilizationRateLabel}
        </span>
      </div>
    </div>
  );
}

export function InterestRateModelCard({
  reserve,
  utilizationBps,
  symbol,
}: {
  reserve: AaveReserveConfig;
  /**
   * Live utilization in BPS from the page's 60s reserve reads — drives both
   * the header figure and the "Current" marker. They share one source value;
   * the callout rounds to a whole percent (Figma callout format) while the
   * header keeps `formatBasisPointsAsPercent` precision.
   */
  utilizationBps: number | null;
  symbol: string;
}) {
  const { curve, kinkUtilizationPercent, maxAprPercent, isLoading } =
    useInterestRateModelCurve({ reserve });

  const currentUtilizationPercent =
    utilizationBps === null ? null : utilizationBps / BPS_PER_PERCENT;
  const utilizationValue =
    utilizationBps === null
      ? COPY.common.emptyValue
      : formatBasisPointsAsPercent(utilizationBps);

  // Hooks run before either early return below (rules-of-hooks), so every
  // memo here must tolerate the null states those returns handle — the
  // fallback values are never rendered, since the null-curve branch bails
  // before reaching the chart.
  const chartData = useMemo(
    () =>
      curve?.map((point) => ({
        x: point.utilizationPercent,
        y: point.aprPercent,
      })) ?? [],
    [curve],
  );

  // Domain and ticks derive from one rounded ceiling (see percentAxis), so
  // the top gridline can never land outside the plot.
  const { domain: yDomain, ticks: yTicks } = useMemo(
    () =>
      maxAprPercent !== null && maxAprPercent > 0
        ? percentAxis(maxAprPercent, Y_TICK_COUNT)
        : { domain: [0, 0] as [number, number], ticks: [] as ChartAxisTick[] },
    [maxAprPercent],
  );

  // The curve always includes an exact sample at the kink utilization (see
  // useInterestRateModelCurve module doc) — looked up by equality, never
  // interpolated. That invariant is load-bearing, so its failure throws
  // rather than degrading to a chart with no kink marker. The "Current"
  // marker derives entirely from the live utilization — its callout APR is
  // read off the cached curve at that x, so the dot and the label can never
  // disagree (previously they came from two independently-polled queries).
  const markers = useMemo<LineChartMarker[]>(() => {
    if (curve === null || kinkUtilizationPercent === null) {
      return [];
    }

    const kinkPoint = curve.find(
      (point) => point.utilizationPercent === kinkUtilizationPercent,
    );
    if (kinkPoint === undefined) {
      throw new Error(
        `IRM curve is missing its exact kink sample at ${kinkUtilizationPercent}% utilization`,
      );
    }

    const kinkMarker: LineChartMarker = {
      key: "kink",
      x: kinkUtilizationPercent,
      title: COPY.marketData.charts.optimalCallout(
        formatWholeUtilizationPercent(kinkUtilizationPercent),
      ),
      lines: [
        COPY.marketData.charts.calloutApr(
          formatAprPercent(kinkPoint.aprPercent),
        ),
      ],
      style: "dashed",
      color: MARKER_COLOR,
    };

    if (currentUtilizationPercent === null) {
      return [kinkMarker];
    }

    return [
      kinkMarker,
      {
        key: "current",
        x: currentUtilizationPercent,
        title: COPY.marketData.charts.currentCallout(
          formatWholeUtilizationPercent(currentUtilizationPercent),
        ),
        lines: [
          COPY.marketData.charts.calloutApr(
            formatAprPercent(
              aprAtUtilization(curve, currentUtilizationPercent),
            ),
          ),
        ],
        style: "solid",
        color: MARKER_COLOR,
      },
    ];
  }, [curve, kinkUtilizationPercent, currentUtilizationPercent]);

  const header = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <span className={CAPTION_CLASS}>
            {COPY.marketData.charts.utilizationRateLabel}
          </span>
          <Hint tooltip={COPY.marketData.charts.utilizationRateTooltip} />
        </div>
        <span className="text-2xl leading-[1.334] text-accent-primary">
          {utilizationValue}
        </span>
      </div>
      <Legend />
    </div>
  );

  if (isLoading) {
    return (
      <div className={CARD_CLASS} data-testid="interest-rate-model-card">
        {header}
        <p className="text-accent-secondary">{COPY.common.loading}</p>
      </div>
    );
  }

  // A configured strategy always yields the full sample set plus the kink
  // figure (see useInterestRateModelCurve); anything null here means the read
  // failed, not that the market genuinely has no rate. A max of 0 (a strategy
  // with every rate param zeroed) is folded in: it admits no usable y scale,
  // only a degenerate [0, 0] domain. The live figures are deliberately not
  // gates — a missing current marker degrades to a kink-only chart.
  if (
    curve === null ||
    kinkUtilizationPercent === null ||
    maxAprPercent === null ||
    maxAprPercent === 0
  ) {
    return (
      <div className={CARD_CLASS} data-testid="interest-rate-model-card">
        {header}
        <p className="text-accent-secondary">
          {COPY.marketData.charts.chartUnavailable}
        </p>
      </div>
    );
  }

  return (
    <div className={CARD_CLASS} data-testid="interest-rate-model-card">
      {header}
      <LineChart
        data={chartData}
        interpolation="linear"
        xDomain={X_DOMAIN}
        yDomain={yDomain}
        yTicks={yTicks}
        xTicks={X_TICKS}
        markers={markers}
        color={SERIES_COLOR}
        aspectRatio={CHART_ASPECT_RATIO}
        grid={{ lines: "horizontal", style: "solid" }}
        hoverMode="interpolate"
        renderTooltip={(hover) => (
          <div className="flex flex-col gap-0.5">
            <span>{formatWholeUtilizationPercent(hover.x)}</span>
            <span>{formatAprPercent(hover.y)}</span>
          </div>
        )}
        ariaLabel={COPY.marketData.charts.irmAriaLabel(symbol)}
      />
    </div>
  );
}
