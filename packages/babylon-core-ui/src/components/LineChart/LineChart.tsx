import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { GridColumns, GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { Bar, Line } from "@visx/shape";
import { Text } from "@visx/text";
import { twJoin } from "tailwind-merge";
import "./LineChart.css";
import {
  AXIS_LABEL_GAP_PX,
  TEXT_LINE_HEIGHT,
  X_AXIS_MARGIN_TOP_PX,
  useChartLayout,
} from "../charts/chartLayout";
import { AXIS_LETTER_SPACING_PX, chartFont, measureText } from "../charts/textMeasure";
import { layoutCallouts, type CalloutBox } from "./calloutLayout";
import { buildLinePath, fitDomain, nearestIndex, normalizeSeries, valueAtX } from "./lineSeries";
import type { LineChartHover, LineChartMarker, LineChartProps } from "./types";

const CALLOUT_PAD_X_PX = 10;
const CALLOUT_PAD_Y_PX = 8;
const CALLOUT_LINE_GAP_PX = 4;
const CALLOUT_TOP_INSET_PX = 8;
const CALLOUT_RADIUS_PX = 4;
const MARKER_DOT_RADIUS_PX = 4;
const TOOLTIP_INSET_PX = 8;
/** Past this fraction of the plot, the tooltip flips to the pointer's left. */
const TOOLTIP_FLIP_FRAC = 0.6;
const DEFAULT_Y_DOMAIN_PADDING = 0.05;

interface MarkerGeom {
  marker: LineChartMarker;
  x: number;
  /** Null when the series is empty, so no dot is drawn at a made-up value. */
  y: number | null;
  callout: { left: number; top: number; width: number; height: number; lines: string[] };
}

function calloutSize(marker: LineChartMarker, titleFont: string, lineFont: string, lineHeight: number) {
  const lines = marker.lines ?? [];
  const widest = Math.max(
    measureText(marker.title, titleFont),
    ...lines.map((line) => measureText(line, lineFont)),
    0,
  );
  const rows = 1 + lines.length;
  return {
    lines,
    width: widest + 2 * CALLOUT_PAD_X_PX,
    height: 2 * CALLOUT_PAD_Y_PX + rows * lineHeight + (rows - 1) * CALLOUT_LINE_GAP_PX,
  };
}

export function LineChart({
  data,
  interpolation = "linear",
  xDomain,
  yDomain,
  yDomainPadding = DEFAULT_Y_DOMAIN_PADDING,
  yTicks,
  xTicks,
  markers,
  aspectRatio,
  grid,
  hoverMode = "interpolate",
  renderTooltip,
  onHoverChange,
  color,
  animate = false,
  ariaLabel,
  className,
}: LineChartProps) {
  const series = useMemo(() => normalizeSeries(data), [data]);
  const hasXAxis = Boolean(xTicks?.length);
  const { parentRef, layout, collapsed } = useChartLayout({
    axisSide: "left",
    hasTopLegend: false,
    hasXAxis,
    aspectRatio,
  });

  const resolvedXDomain = useMemo(() => xDomain ?? fitDomain(series.map((p) => p.x)), [xDomain, series]);
  const xScale = useMemo(
    () => scaleLinear<number>({ domain: resolvedXDomain, range: [0, layout.plotWidth] }),
    [resolvedXDomain, layout.plotWidth],
  );
  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: yDomain ?? fitDomain(series.map((p) => p.y), yDomainPadding),
        range: [layout.plotHeight, 0],
      }),
    [yDomain, yDomainPadding, series, layout.plotHeight],
  );

  const path = useMemo(
    () => buildLinePath(series.map((p) => ({ x: xScale(p.x), y: yScale(p.y) })), interpolation),
    [series, xScale, yScale, interpolation],
  );

  const gridLines = grid?.lines ?? "both";
  const gridStyle = grid?.style ?? "dashed";
  const lineHeight = Math.round(layout.fontLabel * TEXT_LINE_HEIGHT);

  // Not memoised: the widths come from measureText, whose cache is invalidated
  // by font loads outside React's dependency tracking (see textMeasure.ts).
  const markerGeom: MarkerGeom[] = (() => {
    const [lo, hi] = resolvedXDomain;
    const visible = (markers ?? []).filter(
      (m) => Number.isFinite(m.x) && m.x >= Math.min(lo, hi) && m.x <= Math.max(lo, hi),
    );
    if (visible.length === 0) return [];
    const titleFont = chartFont(layout.fontLabel);
    const lineFont = chartFont(layout.fontAxis);
    const sizes = visible.map((m) => calloutSize(m, titleFont, lineFont, lineHeight));
    const boxes: CalloutBox[] = visible.map((m, i) => ({
      key: m.key,
      anchor: xScale(m.x),
      width: sizes[i].width,
      side: m.side ?? "right",
    }));
    const placed = layoutCallouts(boxes, layout.plotWidth);
    return visible.map((m, i) => {
      const value = valueAtX(series, m.x, interpolation);
      return {
        marker: m,
        x: xScale(m.x),
        y: value === null ? null : yScale(value),
        callout: {
          left: placed[i].left,
          top: CALLOUT_TOP_INSET_PX,
          width: sizes[i].width,
          height: sizes[i].height,
          lines: sizes[i].lines,
        },
      };
    });
  })();

  const [pointerX, setPointerX] = useState<number | null>(null);
  const hover: LineChartHover | null = useMemo(() => {
    if (pointerX === null || series.length === 0) return null;
    const domainX = xScale.invert(pointerX);
    const index = nearestIndex(series, domainX);
    const point = series[index];
    if (hoverMode === "nearest") return { x: point.x, y: point.y, point, index };
    const y = valueAtX(series, domainX, interpolation);
    return y === null ? null : { x: domainX, y, point, index };
  }, [pointerX, series, xScale, hoverMode, interpolation]);

  // The callback is read through a ref so an inline arrow in the consumer
  // doesn't re-fire the notification on every unrelated render.
  const notify = useRef(onHoverChange);
  notify.current = onHoverChange;
  useEffect(() => {
    notify.current?.(hover);
  }, [hover]);

  // The hit rect covers the plot exactly and the SVG carries no viewBox, so one
  // user unit is one CSS pixel and its client rect gives plot-local coordinates
  // directly.
  const trackPointer = (event: React.PointerEvent<SVGRectElement>) => {
    if (layout.plotWidth === 0) return;
    const { left } = event.currentTarget.getBoundingClientRect();
    setPointerX(Math.min(layout.plotWidth, Math.max(0, event.clientX - left)));
  };

  // A touch pointer is destroyed on lift, so the browser fires pointerleave
  // immediately after pointerup — clearing there would make a tap flash the
  // readout and lose it. Touch readouts persist until the next tap moves them;
  // mouse hover keeps the usual leave-to-clear.
  const releasePointer = (event: React.PointerEvent<SVGRectElement>) => {
    if (event.pointerType === "mouse") setPointerX(null);
  };

  if (collapsed) return null;

  const hoverPx = hover === null ? null : xScale(hover.x);
  const tooltip = hover === null ? null : renderTooltip?.(hover);
  const seriesVars = (color ? { "--bbn-line-chart-series": color } : {}) as CSSProperties;
  const chartVars = { "--bbn-chart-axis-letter-spacing": `${AXIS_LETTER_SPACING_PX}px` } as CSSProperties;
  const enter = animate ? "bbn-line-chart__enter" : undefined;

  return (
    <div
      ref={parentRef}
      style={chartVars}
      className={twJoin("bbn-line-chart", `bbn-line-chart--gridstyle-${gridStyle}`, className)}
    >
      <div className="bbn-line-chart__canvas">
        <svg
          className="bbn-line-chart__svg"
          width={layout.chartWidth}
          height={layout.svgHeight}
          role="img"
          aria-label={ariaLabel}
        >
          <Group top={layout.plotTop} left={layout.plotLeft}>
            {gridLines !== "none" && yTicks?.length ? (
              <GridRows
                className="bbn-line-chart__grid"
                scale={yScale}
                width={layout.plotWidth}
                tickValues={yTicks.map((t) => t.value)}
                aria-hidden
              />
            ) : null}
            {gridLines === "both" && xTicks?.length ? (
              <GridColumns
                className="bbn-line-chart__grid"
                scale={xScale}
                height={layout.plotHeight}
                tickValues={xTicks.map((t) => t.value)}
                aria-hidden
              />
            ) : null}

            <g className={enter} style={seriesVars}>
              <path className="bbn-line-chart__series" d={path} />
            </g>

            {markerGeom.map(({ marker, x, y, callout }) => {
              const markerVars = (marker.color ? { "--bbn-line-chart-marker": marker.color } : {}) as CSSProperties;
              const dashed = marker.style === "dashed";
              return (
                <g key={marker.key} className={enter} style={markerVars} aria-hidden>
                  <Line
                    className={twJoin("bbn-line-chart__rule", dashed && "bbn-line-chart__rule--dashed")}
                    from={{ x, y: 0 }}
                    to={{ x, y: layout.plotHeight }}
                  />
                  {y === null ? null : (
                    <circle className="bbn-line-chart__dot" cx={x} cy={y} r={MARKER_DOT_RADIUS_PX} />
                  )}
                  <rect
                    className={twJoin("bbn-line-chart__callout", dashed && "bbn-line-chart__callout--dashed")}
                    x={callout.left}
                    y={callout.top}
                    width={callout.width}
                    height={callout.height}
                    rx={CALLOUT_RADIUS_PX}
                  />
                  <Text
                    className="bbn-line-chart__callout-title"
                    x={callout.left + CALLOUT_PAD_X_PX}
                    y={callout.top + CALLOUT_PAD_Y_PX}
                    verticalAnchor="start"
                    fontSize={layout.fontLabel}
                  >
                    {marker.title}
                  </Text>
                  {callout.lines.map((text, row) => (
                    <Text
                      key={text}
                      className="bbn-line-chart__callout-line"
                      x={callout.left + CALLOUT_PAD_X_PX}
                      y={callout.top + CALLOUT_PAD_Y_PX + (row + 1) * (lineHeight + CALLOUT_LINE_GAP_PX)}
                      verticalAnchor="start"
                      fontSize={layout.fontAxis}
                    >
                      {text}
                    </Text>
                  ))}
                </g>
              );
            })}

            {hover !== null && hoverPx !== null ? (
              <g aria-hidden>
                <Line
                  className="bbn-line-chart__crosshair"
                  from={{ x: hoverPx, y: 0 }}
                  to={{ x: hoverPx, y: layout.plotHeight }}
                />
                <circle
                  className="bbn-line-chart__hover-dot"
                  style={seriesVars}
                  cx={hoverPx}
                  cy={yScale(hover.y)}
                  r={MARKER_DOT_RADIUS_PX}
                />
              </g>
            ) : null}

            <Bar
              className="bbn-line-chart__hit"
              x={0}
              y={0}
              width={layout.plotWidth}
              height={layout.plotHeight}
              fill="transparent"
              onPointerDown={trackPointer}
              onPointerMove={trackPointer}
              onPointerLeave={releasePointer}
              onPointerCancel={() => setPointerX(null)}
              data-testid="line-chart-hit"
            />
          </Group>

          {yTicks?.map((tick) => (
            <Text
              key={`y-${tick.value}`}
              className="bbn-line-chart__axis-text"
              x={layout.gutter - AXIS_LABEL_GAP_PX}
              y={layout.plotTop + yScale(tick.value)}
              textAnchor="end"
              verticalAnchor="middle"
              fontSize={layout.fontAxis}
              aria-hidden
            >
              {tick.label}
            </Text>
          ))}

          {xTicks?.map((tick, index) => (
            <Text
              key={`x-${tick.value}`}
              className="bbn-line-chart__axis-text"
              x={layout.plotLeft + xScale(tick.value)}
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

        {tooltip ? (
          <div
            className={twJoin(
              "bbn-line-chart__tooltip",
              hoverPx !== null && hoverPx > TOOLTIP_FLIP_FRAC * layout.plotWidth && "bbn-line-chart__tooltip--left",
            )}
            style={{
              left: layout.plotLeft + (hoverPx ?? 0),
              top: layout.plotTop + TOOLTIP_INSET_PX,
              fontSize: layout.fontAxis,
            }}
          >
            {tooltip}
          </div>
        ) : null}
      </div>
    </div>
  );
}
