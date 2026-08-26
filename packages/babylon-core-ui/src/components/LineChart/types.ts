/**
 * Semantics-free line-chart contract. core-ui knows nothing about what the
 * series measures: the app supplies numbers and pre-formatted strings, and
 * every label, tick and callout is its own wording.
 */

import type { ReactNode } from "react";
import type { ChartAxisTick, ChartGridConfig } from "../charts/types";

export type { ChartAxisTick, ChartGridConfig };

export interface LineChartPoint {
  x: number;
  y: number;
}

/**
 * How consecutive points join. `"step"` holds each value until the next x
 * (step-after), for series that change discretely rather than continuously.
 */
export type LineInterpolation = "linear" | "step";

/** Inclusive `[min, max]` in domain units. */
export type LineChartDomain = [number, number];

/** Rule + callout stroke style. Mirrors the two marker treatments in the spec. */
export type MarkerStyle = "solid" | "dashed";

/**
 * A vertical rule at `x` with a dot on the series and an annotated callout.
 * Callouts sit on `side` unless that would overlap another callout or leave
 * the plot, in which case they flip; see `calloutLayout.ts`.
 */
export interface LineChartMarker {
  key: string;
  /** Position in x-domain units. Off-domain markers are dropped. */
  x: number;
  /** Callout heading. */
  title: string;
  /** Additional callout lines under the heading. */
  lines?: string[];
  /** Default `"solid"`. */
  style?: MarkerStyle;
  /** Preferred callout side before collision resolution. Default `"right"`. */
  side?: "left" | "right";
  /** CSS colour for the rule, dot and callout border. Defaults to the series colour. */
  color?: string;
}

export interface LineChartHover {
  /** Domain x under the pointer, snapped to the datum in `"nearest"` mode. */
  x: number;
  /** Series value at `x`, interpolated or the datum's, per `hoverMode`. */
  y: number;
  /** The datum closest to the pointer. */
  point: LineChartPoint;
  index: number;
}

/**
 * `"interpolate"` reads the value anywhere along the line; `"nearest"` snaps to
 * the closest datum.
 */
export type LineChartHoverMode = "interpolate" | "nearest";

export interface LineChartProps {
  /** Series points. Sorted ascending by x before use. */
  data: LineChartPoint[];
  /** Default `"linear"`. */
  interpolation?: LineInterpolation;
  /** Explicit x domain. Omit to fit the data. */
  xDomain?: LineChartDomain;
  /** Explicit y domain. Omit to fit the data — never forced through zero. */
  yDomain?: LineChartDomain;
  /**
   * Headroom added above and below a fitted y domain, as a fraction of its
   * span. Ignored when `yDomain` is explicit. Default 0.05.
   */
  yDomainPadding?: number;
  /** Y-axis ticks in the left gutter; labels pre-formatted by the app. */
  yTicks?: ChartAxisTick[];
  /** X-axis ticks under the plot; labels pre-formatted by the app. */
  xTicks?: ChartAxisTick[];
  markers?: LineChartMarker[];
  /** Plot width / plot height. Defaults to the shared chart aspect. */
  aspectRatio?: number;
  grid?: ChartGridConfig;
  /** Default `"interpolate"`. */
  hoverMode?: LineChartHoverMode;
  /** Hover/tap readout. Return `null` to suppress it for a given position. */
  renderTooltip?: (hover: LineChartHover) => ReactNode;
  /** Fires on every hover change, and with `null` when the pointer leaves. */
  onHoverChange?: (hover: LineChartHover | null) => void;
  /** CSS colour for the series stroke. */
  color?: string;
  /** Fade + rise the series and markers in on mount. Default false. */
  animate?: boolean;
  /** Accessible name. The SVG names itself as one image. */
  ariaLabel?: string;
  className?: string;
}
