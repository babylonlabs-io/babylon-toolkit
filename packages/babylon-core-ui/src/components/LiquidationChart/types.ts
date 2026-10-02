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

import type { ChartAxisTick, ChartGridConfig } from "../charts/types";

/** Band colour lane. Maps to the `--liq-band-*` tokens in the chart CSS. */
export type LiquidationBandTone = "1" | "2" | "3";

/**
 * A band's role at the simulated price: `live` = not yet reached, `liquidated`
 * = the simulated price has fallen through this band's top.
 */
export type LiquidationBandState = "live" | "liquidated";

/**
 * Key/value rows shown in the band hover popover. All pre-formatted by the app.
 * `emphasis` tints a value in the band's tone (e.g. the liquidation price).
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
  /**
   * Extra detail folded into the focusable rect's accessible name, for callers
   * that render no `sublabel` but still need its content read out — e.g. the
   * vault names behind an event.
   */
  accessibleDetail?: string;
  /**
   * Collateral seized in this event, pre-formatted, e.g. "0.6 BTC". Rendered
   * as its own line when the band is tall enough. Omit when the caller has
   * already folded the amount into `label`.
   */
  amountLabel?: string;
  /** Band vertical extent in price. `priceTop` is where the event triggers. */
  priceTop: number;
  priceBottom: number;
  /**
   * The Seizure Map X extent, [0,1]. Normally the cumulative collateral share;
   * the app may compress it so a tiny event stays readable, in which case
   * `shareAxisTicks` carries the true percentages.
   */
  shareStart: number;
  shareEnd: number;
  state: LiquidationBandState;
  tone: LiquidationBandTone;
  /** Rows for the hover popover (At price / Distance / Vaults / Seizes). */
  popoverMetrics?: BandPopoverMetric[];
  /** Popover footer value, e.g. "55% seized". */
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
 * vertical weight, so an $180 final segment reads as tall as a $37k one. A
 * price is positioned by piecewise-linear interpolation between
 * adjacent ticks. Order top→bottom (descending value); band `priceTop`/
 * `priceBottom` should coincide with tick values.
 */
export type PriceAxisTick = ChartAxisTick;

/** An x-axis tick placed at an explicit fraction [0,1] of the plot. */
export interface ShareAxisTick {
  fraction: number;
  label: string;
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
   * Hide all in-band text (tiny bands already drop text automatically).
   * For dense/preview surfaces.
   */
  hideBandLabels?: boolean;
  /**
   * Pre-formatted text a liquidated band shows in place of its sublabel and
   * amount, e.g. "Liquidated"; the share legend swaps it for the amount too.
   * Omit to keep a liquidated band's normal text (it still dims).
   */
  liquidatedLabel?: string;
  className?: string;
}

export interface SeizureMapProps extends LiquidationChartBase {
  /** X-axis tick labels left→right, pre-formatted, e.g. ["0%","55%","91%","100%"]. */
  shareAxisLabels?: string[];
  /**
   * X-axis ticks at explicit fractions, for when the band widths are not the
   * raw shares (see `shareStart`/`shareEnd`). Takes precedence over
   * `shareAxisLabels`, which spaces its labels evenly.
   */
  shareAxisTicks?: ShareAxisTick[];
  /**
   * Show the collateral-share legend strip above the plot. Default true in the
   * `full` variant; `compact` never renders it. Off gives a bare plot that
   * still keeps the share axis.
   */
  showShareLegend?: boolean;
  /** Show the inline price-line label. Default true. */
  showPriceLineLabel?: boolean;
  /** Caption at the left of the price line, e.g. "Bitcoin Price". */
  priceLineCaption?: string;
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
 * Optional, toggleable chart interactions. Not part of the design spec — enable
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

/**
 * How the Timeline renders the price series. `"candles+line"` draws the close
 * line over the candles — both are the same series, so use it only where the
 * design calls for the emphasised price trace.
 */
export type TimelineSeriesStyle = "candles" | "line" | "area" | "candles+line";

/**
 * Where the liquidation bands are drawn.
 *  - `gutter`: a column on the left of the plot, candles beside it.
 *  - `plot`:   full plot width, candles drawn over them.
 *  - `none`:   no bands; candles take the full width.
 */
export type TimelineBandPlacement = "gutter" | "plot" | "none";

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
   * Where the seizure map (safe zone + liquidation bands) is drawn. Default
   * `"gutter"`. See {@link TimelineBandPlacement}.
   */
  bandPlacement?: TimelineBandPlacement;
  /** Plot width / plot height. Defaults to the shared chart aspect ratio. */
  aspectRatio?: number;
  /**
   * Height of every liquidation-event row, px. When set, every row renders at
   * least this tall at any chart width: a cascade that would not fit grows the
   * plot past `aspectRatio` instead of compressing its rows, with the candle
   * region keeping its minimum share. Unset, rows default to 44px and a long
   * cascade compresses them to fit the plot.
   */
  eventRowPx?: number;
  /**
   * Override the price-line colour (rule and label, plus the close line and
   * end dot with `seriesStyle="candles+line"`). Default: `--liq-price-line`.
   */
  priceLineColor?: string;
  /** With `pan`, how many candles are visible at once. Default: all candles. */
  visibleCandles?: number;
  /** Formats the crosshair readout price. Default: `$` + grouped integer. */
  formatPrice?: (price: number) => string;
  /** Formats the time-axis tick labels. Default: locale date. */
  formatTime?: (timeMs: number) => string;
  /**
   * Formats the crosshair readout's timestamp. Defaults to `formatTime`, which
   * a caller should override when its axis labels are abbreviated (a bare day
   * number names no month).
   */
  formatReadoutTime?: (timeMs: number) => string;
}
