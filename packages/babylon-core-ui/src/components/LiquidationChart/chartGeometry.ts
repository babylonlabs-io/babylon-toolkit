/**
 * Pixel geometry shared by both charts. The old renderer laid out with CSS
 * (`aspect-ratio`, `cqi` clamps, `@container` queries); the SVG renderer needs
 * the same numbers in TS, computed from the measured chart width, so every
 * mark position is known before render — no measurement passes.
 */

/** The plot's fixed aspect ratio (was `aspect-ratio: 1016 / 350`). */
const PLOT_ASPECT_W = 1016;
const PLOT_ASPECT_H = 350;

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

/* Geometry constants lifted out of the old CSS. */
export const BAND_RADIUS_PX = 2; // --liq-band-radius
export const AXIS_LABEL_GAP_PX = 8; // yaxis-label inset 0.5rem
export const PILL_PAD_X_PX = 6; // pill padding 0.375rem
export const PILL_PAD_Y_PX = 2; // pill padding 0.125rem
export const PILL_AXIS_GAP_PX = 4; // axis-right pill offset 0.25rem
export const PRICE_LABEL_GAP_PX = 2.4; // price-line label offset 0.15rem
/** Below this fraction from the top, the price label sits under the line so it
 * clears the top legend / price zone instead of overflowing above the plot. */
export const PRICE_LABEL_BELOW_FRAC = 0.08;
export const LEGEND_PAD_X_PX = 8; // legend-seg padding 0.5rem
const LEGEND_PAD_Y_PX = 6; // legend-seg padding 0.375rem
export const LEGEND_GAP_PX = 2; // top-legend gap
const LEGEND_MARGIN_BOTTOM_PX = 12; // top-legend margin-bottom 0.75rem
export const X_AXIS_MARGIN_TOP_PX = 6; // xaxis margin-top 0.375rem
export const BAND_PAD_X_PX = 8; // band padding 0.5rem
export const BAND_PAD_Y_PX = 4; // band padding 0.25rem
export const BAND_LINE_GAP_PX = 2; // band gap 0.125rem
export const SAFEZONE_PAD_X_PX = 12; // safezone padding 0.75rem
export const SAFEZONE_PAD_Y_PX = 8; // safezone padding 0.5rem
export const SAFEZONE_BORDER_PX = 1; // safezone border width
export const SAFEZONE_LINE_GAP_PX = 2; // safezone gap 0.125rem
export const OVERLAY_INSET_PX = 8; // readout/zoom offset 0.5rem

/** Approximates a `line-height: normal` line box for Px Grotesk. */
export const TEXT_LINE_HEIGHT = 1.2;

/** Band text-dropout thresholds that were `@container (max-height: …)`
 * queries. Container size queries evaluate the CONTENT box, so callers must
 * compare these against the band height minus its vertical padding.
 * `max-height` matches at exactly the threshold, so the check is `>`, not
 * `>=`. (The safe zone uses a fits-based rule instead — see SeizureGutter.) */
export const DROP_SUBLABEL_MAX_PX = 76;
export const DROP_AMOUNT_MAX_PX = 54;
export const DROP_LABEL_MAX_PX = 26;

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
}): ChartLayout {
  const { chartWidth, axisSide, hasTopLegend, hasXAxis } = input;
  const remPx = rootFontPx();
  const gutter = resolveFluid(GUTTER, chartWidth, remPx);
  const fontAxis = resolveFluid(FONT_AXIS, chartWidth, remPx);
  const fontLabel = resolveFluid(FONT_LABEL, chartWidth, remPx);
  const fontAmount = resolveFluid(FONT_AMOUNT, chartWidth, remPx);

  const plotWidth = Math.max(0, chartWidth - gutter);
  const plotHeight = (plotWidth * PLOT_ASPECT_H) / PLOT_ASPECT_W;
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
