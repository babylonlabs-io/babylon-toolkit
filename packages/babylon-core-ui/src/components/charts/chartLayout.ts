/**
 * Pixel geometry shared by every chart in this package. The original renderer
 * laid out with CSS (`aspect-ratio`, `cqi` clamps, `@container` queries); the
 * SVG renderers need the same numbers in TS, computed from the measured chart
 * width, so every mark position is known before render — no measurement passes.
 */

import { useMemo, useSyncExternalStore } from "react";
import { useParentSize } from "@visx/responsive";
import { getFontEpoch, subscribeFontEpoch } from "./textMeasure";

/** The plot's default aspect ratio (was `aspect-ratio: 1016 / 350`). */
export const DEFAULT_PLOT_ASPECT_RATIO = 1016 / 350;

/** Fluid value mirroring a CSS `clamp(<minRem>rem, <cqiPct>cqi, <maxRem>rem)`. */
interface FluidSize {
  minRem: number;
  cqiPct: number;
  maxRem: number;
}

const GUTTER: FluidSize = { minRem: 3, cqiPct: 7, maxRem: 4.25 };
const FONT_AXIS: FluidSize = { minRem: 0.625, cqiPct: 1.12, maxRem: 0.75 };
const FONT_LABEL: FluidSize = { minRem: 0.7, cqiPct: 1.3, maxRem: 0.875 };
const FONT_AMOUNT: FluidSize = { minRem: 0.75, cqiPct: 1.5, maxRem: 1 };

const DEFAULT_ROOT_FONT_PX = 16;

/** Root font-size in px (the CSS clamps were in `rem`). */
let cachedRootFontPx: number | null = null;

/** The root font size backs every rem-derived clamp. Read once and memoised:
 * it effectively never changes at runtime, and caching keeps this module free
 * of live style reads — the layout stays a pure computation. */
function rootFontPx(): number {
  if (cachedRootFontPx !== null) return cachedRootFontPx;
  if (typeof document === "undefined") return DEFAULT_ROOT_FONT_PX;
  const parsed = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  cachedRootFontPx = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ROOT_FONT_PX;
  return cachedRootFontPx;
}

/** `cqi` = 1% of the chart's own inline size (the chart was its own container). */
function resolveFluid(size: FluidSize, chartWidth: number, remPx: number): number {
  return Math.min(size.maxRem * remPx, Math.max(size.minRem * remPx, (size.cqiPct / 100) * chartWidth));
}

export const AXIS_LABEL_GAP_PX = 8; // yaxis-label inset 0.5rem
export const X_AXIS_MARGIN_TOP_PX = 6; // xaxis margin-top 0.375rem
const LEGEND_PAD_Y_PX = 6; // legend-seg padding 0.375rem
const LEGEND_MARGIN_BOTTOM_PX = 12; // top-legend margin-bottom 0.75rem

/** Approximates a `line-height: normal` line box for Px Grotesk. */
export const TEXT_LINE_HEIGHT = 1.2;

export interface ChartLayout {
  chartWidth: number;
  gutter: number;
  plotLeft: number;
  plotTop: number;
  plotWidth: number;
  plotHeight: number;
  legendHeight: number;
  svgHeight: number;
  fontAxis: number;
  fontLabel: number;
  fontAmount: number;
}

export function computeChartLayout(input: {
  chartWidth: number;
  axisSide: "left" | "right";
  hasTopLegend: boolean;
  hasXAxis: boolean;
  /** Plot width / plot height. Defaults to {@link DEFAULT_PLOT_ASPECT_RATIO}. */
  aspectRatio?: number;
}): ChartLayout {
  const { chartWidth, axisSide, hasTopLegend, hasXAxis, aspectRatio = DEFAULT_PLOT_ASPECT_RATIO } = input;
  const remPx = rootFontPx();
  const gutter = resolveFluid(GUTTER, chartWidth, remPx);
  const fontAxis = resolveFluid(FONT_AXIS, chartWidth, remPx);
  const fontLabel = resolveFluid(FONT_LABEL, chartWidth, remPx);
  const fontAmount = resolveFluid(FONT_AMOUNT, chartWidth, remPx);

  const plotWidth = Math.max(0, chartWidth - gutter);
  const plotHeight = aspectRatio > 0 ? plotWidth / aspectRatio : 0;
  const plotLeft = axisSide === "left" ? gutter : 0;

  const legendHeight = hasTopLegend ? 2 * LEGEND_PAD_Y_PX + Math.round(fontLabel * TEXT_LINE_HEIGHT) : 0;
  const plotTop = hasTopLegend ? legendHeight + LEGEND_MARGIN_BOTTOM_PX : 0;
  const xAxisHeight = hasXAxis ? X_AXIS_MARGIN_TOP_PX + Math.round(fontAxis * TEXT_LINE_HEIGHT) : 0;

  return {
    chartWidth,
    gutter,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
    legendHeight,
    svgHeight: plotTop + plotHeight + xAxisHeight,
    fontAxis,
    fontLabel,
    fontAmount,
  };
}

/** Deterministic SSR/jsdom width; jsdom's ResizeObserver never fires, so a
 * chart must render a full frame from this fallback rather than bail on 0. */
const FALLBACK_CHART_WIDTH_PX = 1016;

/** Measures the chart's container and derives the full pixel layout. */
export function useChartLayout(input: {
  axisSide: "left" | "right";
  hasTopLegend: boolean;
  hasXAxis: boolean;
  aspectRatio?: number;
}): {
  parentRef: (node: HTMLDivElement | null) => void;
  layout: ChartLayout;
  /** True when the container measured 0 wide — the chart renders nothing. */
  collapsed: boolean;
} {
  const { parentRef, width } = useParentSize({
    debounceTime: 16,
    initialSize: { width: FALLBACK_CHART_WIDTH_PX },
  });
  // Re-render when a webfont finishes loading so text measured against the
  // fallback font is redone with the real metrics (see textMeasure.ts).
  useSyncExternalStore(subscribeFontEpoch, getFontEpoch, getFontEpoch);
  // `width` starts at the fallback (initialSize) and only becomes 0 when the
  // ResizeObserver reports a genuinely collapsed container — hidden tab,
  // zero-width flex child. Rendering the fallback there would paint a 1016px
  // chart across the siblings (the SVG overflows visibly), so collapse instead.
  const collapsed = width <= 0;
  const chartWidth = collapsed ? FALLBACK_CHART_WIDTH_PX : width;
  const { axisSide, hasTopLegend, hasXAxis, aspectRatio } = input;
  const layout = useMemo(
    () => computeChartLayout({ chartWidth, axisSide, hasTopLegend, hasXAxis, aspectRatio }),
    [chartWidth, axisSide, hasTopLegend, hasXAxis, aspectRatio],
  );
  return { parentRef, layout, collapsed };
}
