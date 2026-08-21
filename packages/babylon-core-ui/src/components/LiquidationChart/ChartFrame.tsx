import { type CSSProperties, type ReactNode } from "react";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { Line } from "@visx/shape";
import { Text } from "@visx/text";
import { twJoin } from "tailwind-merge";
import { declutterCenters, type DeclutterItem } from "../charts/axisDeclutter";
import { AXIS_LABEL_GAP_PX, TEXT_LINE_HEIGHT, X_AXIS_MARGIN_TOP_PX, type ChartLayout } from "../charts/chartLayout";
import {
  BAND_RADIUS_PX,
  PILL_AXIS_GAP_PX,
  PILL_PAD_X_PX,
  PILL_PAD_Y_PX,
  PRICE_LABEL_BELOW_FRAC,
  PRICE_LABEL_GAP_PX,
} from "./chartGeometry";
import type { PriceScale } from "./priceScale";
import { AXIS_LETTER_SPACING_PX, chartFont, measureText } from "../charts/textMeasure";
import type { ChartGridConfig } from "../charts/types";
import type { LiquidationBandTone, PriceAxisTick, ShareAxisTick } from "./types";

/** Declutter key for the current-price pill (level markers use their band key). */
const CURRENT_PILL_KEY = "__current__";

/** A tone-coloured horizontal level (dashed line + axis pill). */
export interface LevelMarker {
  key: string;
  price: number;
  label: string;
  tone?: LiquidationBandTone;
}

export interface ChartFrameProps {
  parentRef: (node: HTMLDivElement | null) => void;
  layout: ChartLayout;
  priceAxis: PriceAxisTick[];
  priceScale: PriceScale;
  currentPrice: number;
  currentPriceLabel: string;
  /** Which side the price axis sits on. Seizure Map = left, Timeline = right. */
  axisSide?: "left" | "right";
  /** Dashed tone level lines + pills (Timeline liquidation levels). */
  levelMarkers?: LevelMarker[];
  /** Render the current price as an axis pill (Timeline) vs an inline label (Seizure Map). */
  currentPricePill?: boolean;
  /** Show the inline price-line label (Seizure Map). Default true. */
  showPriceLineLabel?: boolean;
  /** Caption at the left of the price line, e.g. "Bitcoin Price". */
  priceLineCaption?: string;
  /** Override the price-line colour (line + default label). */
  priceLineColor?: string;
  /** Override the price-line label colour. Defaults to the price-line colour. */
  priceLineLabelColor?: string;
  /**
   * Pixels of plot width where gridlines/level lines/price line/x-axis begin.
   * Timeline sets this to the band-gutter width so lines don't cross the gutter.
   */
  plotInsetLeft?: number;
  /** X-axis tick labels, evenly distributed under the plot. */
  xAxisLabels?: string[];
  /** X-axis ticks at explicit fractions; takes precedence over `xAxisLabels`. */
  xAxisTicks?: ShareAxisTick[];
  grid?: ChartGridConfig;
  /** Accessible name for the chart. Defaults to caption + current price. */
  ariaLabel?: string;
  className?: string;
  /** SVG rendered above the plot, in legend space (Seizure Map share legend). */
  topLegend?: ReactNode;
  /** SVG rendered inside the plot group (bands, candles, safe zone, crosshair). */
  children: ReactNode;
  /** HTML overlaid on the SVG (Timeline OHLC readout + zoom buttons). */
  overlay?: ReactNode;
}

interface PillGeom {
  key: string;
  label: string;
  tone?: LiquidationBandTone;
  current: boolean;
  x: number;
  width: number;
  top: number;
  height: number;
}

function computePills(input: {
  layout: ChartLayout;
  levelMarkers?: LevelMarker[];
  currentPricePill: boolean;
  currentPriceLabel: string;
  currentY: number;
  priceScale: PriceScale;
  priceAxis: PriceAxisTick[];
  axisSide: "left" | "right";
}): { pills: PillGeom[]; hiddenTickValues: Set<number> } {
  const { layout, levelMarkers, currentPricePill, currentPriceLabel, currentY, priceScale, priceAxis, axisSide } =
    input;
  const pillHeight = Math.round(layout.fontAxis * TEXT_LINE_HEIGHT) + 2 * PILL_PAD_Y_PX;
  const font = chartFont(layout.fontAxis);
  const markers = (levelMarkers ?? []).map((m) => ({
    key: m.key,
    label: m.label,
    tone: m.tone,
    current: false,
    center: priceScale(m.price),
  }));
  if (currentPricePill) {
    markers.push({
      key: CURRENT_PILL_KEY,
      label: currentPriceLabel,
      tone: undefined,
      current: true,
      center: currentY,
    });
  }
  if (markers.length === 0) {
    return { pills: [], hiddenTickValues: new Set<number>() };
  }
  const items: DeclutterItem[] = markers.map((m) => ({ key: m.key, center: m.center, height: pillHeight }));
  // `declutterCenters` returns resolved CENTRES (despite pushing boxes apart
  // by their heights); every consumer below treats them as centres.
  const centers = declutterCenters(items, layout.plotHeight);
  const hidden = new Set<number>();
  // A tick disappears when a pill overlaps it: centre distance under half the
  // sum of the pill box and the tick text height.
  const tickTextHeight = Math.round(layout.fontAxis * TEXT_LINE_HEIGHT);
  const collisionRadius = (pillHeight + tickTextHeight) / 2;
  for (const tick of priceAxis) {
    const tickY = priceScale(tick.value);
    for (const m of markers) {
      const center = centers.get(m.key);
      if (center != null && Math.abs(center - tickY) < collisionRadius) {
        hidden.add(tick.value);
        break;
      }
    }
  }
  const pills: PillGeom[] = markers.map((m) => {
    const width = measureText(m.label, font, AXIS_LETTER_SPACING_PX) + 2 * PILL_PAD_X_PX;
    return {
      key: m.key,
      label: m.label,
      tone: m.tone,
      current: m.current,
      x: axisSide === "right" ? layout.plotWidth + PILL_AXIS_GAP_PX : -(PILL_AXIS_GAP_PX + width),
      width,
      top: (centers.get(m.key) ?? m.center) - pillHeight / 2,
      height: pillHeight,
    };
  });
  return { pills, hiddenTickValues: hidden };
}

export function ChartFrame({
  parentRef,
  layout,
  priceAxis,
  priceScale,
  currentPrice,
  currentPriceLabel,
  axisSide = "left",
  levelMarkers,
  currentPricePill = false,
  showPriceLineLabel = true,
  priceLineCaption,
  priceLineColor,
  priceLineLabelColor,
  plotInsetLeft = 0,
  xAxisLabels,
  xAxisTicks,
  grid,
  ariaLabel,
  className,
  topLegend,
  children,
  overlay,
}: ChartFrameProps) {
  const gridLines = grid?.lines ?? "both";
  const gridStyle = grid?.style ?? "dashed";
  const currentY = priceScale(currentPrice);
  const labelBelow = layout.plotHeight > 0 && currentY / layout.plotHeight < PRICE_LABEL_BELOW_FRAC;

  // Every axis price pill (liquidation levels + current price) as one ordered
  // set. The pill box height is analytic (font size × line height + padding),
  // so overlapping labels are pushed apart right here instead of the old
  // measure-then-rerender ResizeObserver pass. The dashed level/price lines
  // stay put at the true price; only the label moves. A pill also suppresses
  // the axis tick it lands on — the pill labels that height precisely.
  // Deliberately not memoised: the widths come from measureText, whose cache
  // is invalidated by font loads outside React's dependency tracking.
  const { pills, hiddenTickValues } = computePills({
    layout,
    levelMarkers,
    currentPricePill,
    currentPriceLabel,
    currentY,
    priceScale,
    priceAxis,
    axisSide,
  });

  const priceLineVars: CSSProperties = {
    ...(priceLineColor ? { "--liq-price-line": priceLineColor } : {}),
    ...(priceLineLabelColor ? { "--liq-price-line-label": priceLineLabelColor } : {}),
  } as CSSProperties;

  const axisLabelX = axisSide === "left" ? layout.gutter - AXIS_LABEL_GAP_PX : layout.plotWidth + AXIS_LABEL_GAP_PX;
  const axisRegionWidth = layout.plotWidth - plotInsetLeft;
  const xTicks: ShareAxisTick[] | undefined = xAxisTicks?.length
    ? xAxisTicks
    : xAxisLabels?.length
      ? xAxisLabels.map((label, i) => ({
          fraction: xAxisLabels.length < 2 ? 0 : i / (xAxisLabels.length - 1),
          label,
        }))
      : undefined;

  // Everything informative inside the SVG is aria-hidden (ticks, pills,
  // gridlines), so the chart names itself as one image for screen readers.
  const svgLabel = ariaLabel ?? [priceLineCaption, currentPriceLabel].filter(Boolean).join(" ");
  // The TS constant sizes the pills via measureText; emitting it as a CSS var
  // keeps the painted letter-spacing in lockstep with the measured one.
  const chartVars = { "--liq-axis-letter-spacing": `${AXIS_LETTER_SPACING_PX}px` } as CSSProperties;

  return (
    <div
      ref={parentRef}
      style={chartVars}
      className={twJoin("bbn-liq-chart", `bbn-liq-chart--gridstyle-${gridStyle}`, className)}
    >
      <div className="bbn-liq-chart__canvas">
        <svg
          className="bbn-liq-chart__svg"
          width={layout.chartWidth}
          height={layout.svgHeight}
          role="img"
          aria-label={svgLabel}
        >
          {topLegend ? <Group left={layout.plotLeft}>{topLegend}</Group> : null}

          <Group top={layout.plotTop} left={layout.plotLeft}>
            {gridLines === "both" || gridLines === "horizontal" ? (
              <GridRows
                className="bbn-liq-grid"
                scale={priceScale}
                left={plotInsetLeft}
                width={axisRegionWidth}
                tickValues={priceAxis.map((t) => t.value)}
                aria-hidden
              />
            ) : null}

            {levelMarkers?.map((m) => (
              <Line
                key={m.key}
                className={twJoin("bbn-liq-level-line", m.tone && `bbn-liq-level-line--tone-${m.tone}`)}
                from={{ x: plotInsetLeft, y: priceScale(m.price) }}
                to={{ x: layout.plotWidth, y: priceScale(m.price) }}
                aria-hidden
              />
            ))}

            {children}

            <g style={priceLineVars}>
              <Line
                className="bbn-liq-price-line"
                from={{ x: plotInsetLeft, y: currentY }}
                to={{ x: layout.plotWidth, y: currentY }}
                data-testid="liq-current-price-line"
              />
              {!currentPricePill && showPriceLineLabel ? (
                <>
                  {priceLineCaption ? (
                    <Text
                      className="bbn-liq-price-line-text"
                      x={plotInsetLeft}
                      y={labelBelow ? currentY + PRICE_LABEL_GAP_PX : currentY - PRICE_LABEL_GAP_PX}
                      textAnchor="start"
                      verticalAnchor={labelBelow ? "start" : "end"}
                      fontSize={layout.fontAxis}
                    >
                      {priceLineCaption}
                    </Text>
                  ) : null}
                  <Text
                    className="bbn-liq-price-line-text"
                    x={layout.plotWidth}
                    y={labelBelow ? currentY + PRICE_LABEL_GAP_PX : currentY - PRICE_LABEL_GAP_PX}
                    textAnchor="end"
                    verticalAnchor={labelBelow ? "start" : "end"}
                    fontSize={layout.fontAxis}
                  >
                    {currentPriceLabel}
                  </Text>
                </>
              ) : null}
            </g>

            {pills.map((pill) => (
              <g key={pill.key} aria-hidden>
                <rect
                  className={twJoin(
                    "bbn-liq-pill__rect",
                    pill.tone && `bbn-liq-pill__rect--tone-${pill.tone}`,
                    pill.current && "bbn-liq-pill__rect--current",
                  )}
                  x={pill.x}
                  y={pill.top}
                  width={pill.width}
                  height={pill.height}
                  rx={BAND_RADIUS_PX}
                />
                <Text
                  className="bbn-liq-pill__text"
                  x={pill.x + pill.width / 2}
                  y={pill.top + pill.height / 2}
                  textAnchor="middle"
                  verticalAnchor="middle"
                  fontSize={layout.fontAxis}
                >
                  {pill.label}
                </Text>
              </g>
            ))}
          </Group>

          {priceAxis.map((tick, index) =>
            hiddenTickValues.has(tick.value) ? null : (
              <Text
                key={`${tick.value}:${index}`}
                className="bbn-liq-axis-text"
                x={axisLabelX}
                y={layout.plotTop + priceScale(tick.value)}
                textAnchor={axisSide === "left" ? "end" : "start"}
                verticalAnchor="middle"
                fontSize={layout.fontAxis}
                aria-hidden
              >
                {tick.label}
              </Text>
            ),
          )}

          {xTicks?.map((tick, index) => (
            <Text
              key={`${tick.label}-${tick.fraction}`}
              className="bbn-liq-axis-text"
              x={layout.plotLeft + plotInsetLeft + tick.fraction * axisRegionWidth}
              y={layout.plotTop + layout.plotHeight + X_AXIS_MARGIN_TOP_PX}
              textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"}
              verticalAnchor="start"
              fontSize={layout.fontAxis}
              aria-hidden
            >
              {tick.label}
            </Text>
          ))}
        </svg>
        {overlay}
      </div>
    </div>
  );
}
