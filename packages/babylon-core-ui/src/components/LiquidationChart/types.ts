/**
 * Protocol-agnostic chart contract. core-ui never imports the vault's
 * `LiquidationGroup`; the app projects groups into these shapes and does ALL
 * formatting (prices, dates, percentages) so this layer stays a dumb renderer.
 *
 * Two chart types share one price frame and one band overlay:
 *  - Seizure Map: X = cumulative collateral share.
 *  - Timeline:    X = time, with OHLC candles. `candles` is the only field with
 *                 no data source today (issue #2043 price-history follow-up);
 *                 empty renders the frame + band gutter without marks.
 */

/** Band colour lane. Maps to the `--liq-band-*` tokens in the chart CSS. */
export type LiquidationBandTone = "1" | "2" | "3";

/**
 * A band's role at the simulated price: `live` = not yet reached, `liquidated`
 * = the simulated price has fallen through this band's top.
 */
export type LiquidationBandState = "live" | "liquidated";

/**
 * Key/value rows shown in the band hover popover. All pre-formatted by the app.
 * `emphasis` tints a value (e.g. the liquidation price in the band's tone).
 */
export interface BandPopoverMetric {
  label: string;
  value: string;
  emphasis?: boolean;
}

export interface LiquidationBand {
  key: string;
  /** Primary label, e.g. "Liq Event 1". */
  label: string;
  /** Secondary label, e.g. "(contain vault 1)". Hidden in compact / tight bands. */
  sublabel?: string;
  /** Collateral seized in this event, pre-formatted, e.g. "0.6 BTC". */
  amountLabel: string;
  /** Band vertical extent in price. `priceTop` is where the event triggers. */
  priceTop: number;
  priceBottom: number;
  /** Cumulative collateral share [0,1] — the Seizure Map X extent. */
  shareStart: number;
  shareEnd: number;
  state: LiquidationBandState;
  tone: LiquidationBandTone;
  /** Rows for the hover popover (At price / Distance / Vaults / Seizes). */
  popoverMetrics?: BandPopoverMetric[];
  /** Footer row, e.g. "55% seized". */
  cumulativeLabel?: string;
}

/** One OHLC bar. Timeline only; no data source exists yet. */
export interface Candle {
  /** Unix ms. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type LiquidationChartVariant = "full" | "compact";

/**
 * A price-axis tick. The Seizure Map uses a *segmented* axis: ticks are spaced
 * evenly regardless of the price gap between them, so each event gets equal
 * vertical weight (matching Figma, where an $180 final segment reads as tall as
 * a $37k one). A price is positioned by piecewise-linear interpolation between
 * adjacent ticks. Order top→bottom (descending value); band `priceTop`/
 * `priceBottom` should coincide with tick values.
 */
export interface PriceAxisTick {
  value: number;
  label: string;
}

/** Background grid configuration, shared by both charts. */
export interface ChartGridConfig {
  /** Which gridlines render. Default `"both"`. */
  lines?: "both" | "horizontal" | "none";
  /** Gridline stroke style. Default `"dashed"`. */
  style?: "dashed" | "dotted" | "solid";
}

interface LiquidationChartBase {
  bands: LiquidationBand[];
  /** The "Bitcoin Price" rule; drives which bands read as liquidated. */
  currentPrice: number;
  /** Pre-formatted price for the rule's right-hand label, e.g. "$88,400". */
  currentPriceLabel: string;
  /** Y-axis ticks top→bottom (descending value). See {@link PriceAxisTick}. */
  priceAxis: PriceAxisTick[];
  variant?: LiquidationChartVariant;
  /** Background grid. Omit for the default dashed full grid. */
  grid?: ChartGridConfig;
  /**
   * Hide all in-band text (tiny bands already drop text automatically); the
   * hover popover still names the event. For dense/preview surfaces.
   */
  hideBandLabels?: boolean;
  /** Fired when a band (or its popover footer) is clicked — app scrolls to the card. */
  onBandClick?: (key: string) => void;
  /** Popover footer CTA, e.g. "click to open card". Omitted → no CTA row. */
  bandClickHint?: string;
  className?: string;
}

export interface SeizureMapProps extends LiquidationChartBase {
  /** X-axis tick labels left→right, pre-formatted, e.g. ["0%","55%","91%","100%"]. */
  shareAxisLabels?: string[];
  /** Show the inline price-line label. Default true. */
  showPriceLineLabel?: boolean;
  /** Override the price-line colour (line + default label). Default: `--liq-price-line`. */
  priceLineColor?: string;
  /** Override the price-line label colour. Default: the price-line colour. */
  priceLineLabelColor?: string;
}

/** Bordered callout filling the safe region (top → first liq) in the band gutter. */
export interface SafeZone {
  title: string;
  lines: string[];
}

/**
 * Optional, toggleable chart interactions. Not part of the Figma spec — enable
 * per surface. Both default off so the chart stays a static render unless asked.
 */
export interface TimelineInteractions {
  /** Vertical crosshair + OHLC readout tracking the nearest candle on hover. */
  crosshair?: boolean;
  /** Drag horizontally to pan back through history (needs candles > visibleCandles). */
  pan?: boolean;
  /**
   * Zoom the visible candle window: wheel over the chart, on-chart +/− buttons,
   * and a reset control (double-click also resets to the default view).
   */
  zoom?: boolean;
}

/** How the Timeline renders the price series. */
export type TimelineSeriesStyle = "candles" | "line" | "area";

export interface TimelineProps extends LiquidationChartBase {
  /** Empty until the price-history ticket lands. */
  candles?: Candle[];
  /** Time-axis tick labels left→right, pre-formatted, evenly spaced. */
  timeAxisLabels?: string[];
  safeZone?: SafeZone;
  interactions?: TimelineInteractions;
  /** Price-series render mode. Default `"candles"`. */
  seriesStyle?: TimelineSeriesStyle;
  /**
   * Render the seizure-map gutter (safe zone + liquidation bands) on the
   * left. Default true; `false` unplugs it and candles take the full width.
   */
  bandGutter?: boolean;
  /** With `pan`, how many candles are visible at once. Default: all candles. */
  visibleCandles?: number;
  /** Formats the crosshair readout price. Default: `$` + grouped integer. */
  formatPrice?: (price: number) => string;
  /** Formats the crosshair readout timestamp. Default: locale date. */
  formatTime?: (timeMs: number) => string;
}
