import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localPoint } from "@visx/event";
import { GridColumns } from "@visx/grid";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { AreaClosed, Bar, Line, LinePath } from "@visx/shape";
import "./LiquidationChart.css";
import { ChartFrame, useChartLayout, type LevelMarker } from "./ChartFrame";
import { SeizureGutter } from "./SeizureGutter";
import { OVERLAY_INSET_PX } from "./chartGeometry";
import { createLinearPriceScale } from "./priceScale";
import type { Candle, TimelineProps } from "./types";

/** Fraction of plot width reserved on the left for the liquidation bands. */
const BAND_GUTTER_FRAC = 0.22;
/** Candle body width as a fraction of its slot. */
const CANDLE_BODY_RATIO = 0.6;
/** Zoom floor: never show fewer candles than this. */
const MIN_ZOOM_CANDLES = 10;
const ZOOM_IN_FACTOR = 0.8;
const ZOOM_OUT_FACTOR = 1.25;
/** Minimum candle body height as a plot fraction; keeps doji candles visible. */
const CANDLE_BODY_MIN_HEIGHT = 0.004;
/** Minimum candle body height in px (was the CSS `min-height: 1px`). */
const CANDLE_BODY_MIN_HEIGHT_PX = 1;
/** Past this fraction of the candle region, the readout flips to the left. */
const READOUT_FLIP_FRAC = 0.6;

const defaultFormatPrice = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const defaultFormatTime = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

interface SeriesPoint {
  x: number;
  y: number;
}

interface CandleGeom {
  key: number;
  candle: Candle;
  center: number; // px within the candle region
  bodyLeft: number;
  bodyWidth: number;
  wickTop: number;
  wickBottom: number;
  bodyTop: number;
  bodyHeight: number;
  bullish: boolean;
}

function layoutCandles(
  candles: Candle[],
  priceToPx: (price: number) => number,
  regionWidth: number,
  plotHeight: number,
): CandleGeom[] {
  const slot = candles.length ? regionWidth / candles.length : regionWidth;
  const bodyWidth = slot * CANDLE_BODY_RATIO;
  const minBodyHeight = Math.max(CANDLE_BODY_MIN_HEIGHT * plotHeight, CANDLE_BODY_MIN_HEIGHT_PX);
  return candles.map((c, i) => {
    const center = (i + 0.5) * slot;
    const bodyTop = priceToPx(Math.max(c.open, c.close));
    return {
      key: c.time,
      candle: c,
      center,
      bodyLeft: center - bodyWidth / 2,
      bodyWidth,
      wickTop: priceToPx(c.high),
      wickBottom: priceToPx(c.low),
      bodyTop,
      bodyHeight: Math.max(priceToPx(Math.min(c.open, c.close)) - bodyTop, minBodyHeight),
      bullish: c.close >= c.open,
    };
  });
}

export function Timeline({
  bands,
  candles = [],
  currentPrice,
  currentPriceLabel,
  priceAxis,
  timeAxisLabels,
  safeZone,
  interactions,
  seriesStyle = "candles",
  visibleCandles,
  formatPrice = defaultFormatPrice,
  formatTime = defaultFormatTime,
  variant = "full",
  grid,
  hideBandLabels,
  bandGutter = true,
  className,
}: TimelineProps) {
  const compact = variant === "compact";
  // The time axis exists only when there is something to label: derived ticks
  // from candles, or the caller's static labels.
  const hasXAxis = !compact && (candles.length > 0 || Boolean(timeAxisLabels?.length));
  const { parentRef, layout } = useChartLayout({ axisSide: "right", hasTopLegend: false, hasXAxis });
  const gutterWidth = bandGutter ? BAND_GUTTER_FRAC * layout.plotWidth : 0;
  const regionWidth = Math.max(0, layout.plotWidth - gutterWidth);
  const priceMax = priceAxis[0]?.value ?? currentPrice;
  const priceMin = priceAxis[priceAxis.length - 1]?.value ?? 0;

  const priceScale = useMemo(
    () => createLinearPriceScale(priceMax, priceMin, layout.plotHeight),
    [priceMax, priceMin, layout.plotHeight],
  );

  // Visible window. `startIndex === null` means "pinned to the most recent
  // candles" — this survives candles arriving asynchronously and is the
  // default-view state that zoom-reset returns to.
  const zoomEnabled = Boolean(interactions?.zoom) && candles.length > MIN_ZOOM_CANDLES;
  const defaultWindow = Math.min(visibleCandles ?? candles.length, candles.length) || candles.length;
  const [windowOverride, setWindowOverride] = useState<number | null>(null);
  const windowSize = Math.max(1, Math.min(windowOverride ?? defaultWindow, candles.length) || 1);
  const maxStart = Math.max(0, candles.length - windowSize);
  const [startIndex, setStartIndex] = useState<number | null>(null);
  const clampedStart = startIndex === null ? maxStart : Math.min(startIndex, maxStart);

  const panEnabled = Boolean(interactions?.pan) && candles.length > windowSize;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const hitRef = useRef<SVGRectElement | null>(null);
  const drag = useRef<{ x: number; start: number } | null>(null);
  // Mirrors `drag.current` as state so the `grabbing` cursor toggles on the same
  // render as the drag starts/ends (a ref alone schedules no re-render).
  const [dragging, setDragging] = useState(false);

  const windowed = useMemo(
    () => candles.slice(clampedStart, clampedStart + windowSize),
    [candles, clampedStart, windowSize],
  );
  const candleGeom = useMemo(
    () => layoutCandles(windowed, priceScale, regionWidth, layout.plotHeight),
    [windowed, priceScale, regionWidth, layout.plotHeight],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const next = Math.max(MIN_ZOOM_CANDLES, Math.min(Math.round(windowSize * factor), candles.length));
      // Anchor the window's right edge so zooming doesn't jump through time.
      const end = clampedStart + windowSize;
      setWindowOverride(next);
      setStartIndex(end >= candles.length ? null : Math.max(0, end - next));
    },
    [windowSize, candles.length, clampedStart],
  );

  const resetView = useCallback(() => {
    setWindowOverride(null);
    setStartIndex(null);
  }, []);

  // Wheel zoom needs a native non-passive listener (React's root wheel
  // listener is passive, so preventDefault would be ignored).
  useEffect(() => {
    const el = hitRef.current;
    if (!el || !zoomEnabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY > 0 ? ZOOM_OUT_FACTOR : ZOOM_IN_FACTOR);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomEnabled, zoomBy]);

  // Only mark liquidation levels that fall within the visible price domain;
  // off-scale levels would clamp to the floor and collide with each other.
  const levelMarkers: LevelMarker[] = useMemo(
    () =>
      bands
        .filter((b) => b.priceTop <= priceMax && b.priceTop >= priceMin)
        .map((b) => ({
          key: b.key,
          price: b.priceTop,
          label: formatPrice(b.priceTop),
          tone: b.tone,
        })),
    [bands, formatPrice, priceMax, priceMin],
  );

  const crosshairEnabled = Boolean(interactions?.crosshair) && candles.length > 0;

  // Derive the time axis from the visible candles so it stays coherent while
  // panning/zooming; fall back to the caller's static labels without candles.
  const xAxisLabels = useMemo(() => {
    if (compact) return undefined;
    if (!windowed.length) return timeAxisLabels;
    const ticks = Math.min(7, windowed.length);
    return Array.from({ length: ticks }, (_, i) => {
      const idx = Math.round((i / (ticks - 1)) * (windowed.length - 1));
      return formatTime(windowed[idx].time);
    });
  }, [compact, windowed, timeAxisLabels, formatTime]);

  // Vertical gridline scale over the candle region, one line per time tick.
  const timeScale = useMemo(
    () => scaleLinear<number>({ domain: [0, 1], range: [gutterWidth, gutterWidth + regionWidth] }),
    [gutterWidth, regionWidth],
  );

  const regionFraction = (event: React.PointerEvent<SVGRectElement>) => {
    const point = localPoint(event);
    if (!point || regionWidth === 0) return 0;
    return Math.min(1, Math.max(0, (point.x - layout.plotLeft - gutterWidth) / regionWidth));
  };

  const onPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (drag.current) {
      const deltaFrac = regionWidth === 0 ? 0 : (e.clientX - drag.current.x) / regionWidth;
      const deltaIndex = Math.round(deltaFrac * windowSize);
      const next = Math.min(maxStart, Math.max(0, drag.current.start - deltaIndex));
      setStartIndex(next === maxStart ? null : next);
      return;
    }
    if (crosshairEnabled) {
      const f = regionFraction(e);
      setHoverIndex(Math.min(windowed.length - 1, Math.max(0, Math.floor(f * windowed.length))));
    }
  };

  const onPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    if (!panEnabled) return;
    drag.current = { x: e.clientX, start: clampedStart };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const endDrag = (e: React.PointerEvent<SVGRectElement>) => {
    if (drag.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
    setDragging(false);
  };

  const hovered = hoverIndex != null ? candleGeom[hoverIndex] : null;
  const interactive = crosshairEnabled || panEnabled || zoomEnabled;

  return (
    <ChartFrame
      parentRef={parentRef}
      layout={layout}
      priceAxis={priceAxis}
      priceScale={priceScale}
      currentPrice={currentPrice}
      currentPriceLabel={currentPriceLabel}
      axisSide="right"
      currentPricePill
      levelMarkers={levelMarkers}
      plotInsetLeft={gutterWidth}
      xAxisLabels={xAxisLabels}
      grid={grid}
      className={className}
      overlay={
        <>
          {hovered ? (
            <div
              className={
                hovered.center > READOUT_FLIP_FRAC * regionWidth
                  ? "bbn-liq-readout bbn-liq-readout--left"
                  : "bbn-liq-readout"
              }
              style={{
                left: layout.plotLeft + gutterWidth + hovered.center,
                top: layout.plotTop + OVERLAY_INSET_PX,
                fontSize: layout.fontAxis,
              }}
            >
              <span className="bbn-liq-readout__time">{formatTime(hovered.candle.time)}</span>
              <span className="bbn-liq-readout__row">
                <span>O</span>
                <span>{formatPrice(hovered.candle.open)}</span>
              </span>
              <span className="bbn-liq-readout__row">
                <span>H</span>
                <span>{formatPrice(hovered.candle.high)}</span>
              </span>
              <span className="bbn-liq-readout__row">
                <span>L</span>
                <span>{formatPrice(hovered.candle.low)}</span>
              </span>
              <span className="bbn-liq-readout__row">
                <span>C</span>
                <span>{formatPrice(hovered.candle.close)}</span>
              </span>
            </div>
          ) : null}
          {zoomEnabled ? (
            <div
              className="bbn-liq-zoom"
              style={{
                top: layout.plotTop + OVERLAY_INSET_PX,
                right: layout.gutter + OVERLAY_INSET_PX,
                fontSize: layout.fontLabel,
              }}
            >
              <button type="button" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_IN_FACTOR)}>
                +
              </button>
              <button type="button" aria-label="Zoom out" onClick={() => zoomBy(ZOOM_OUT_FACTOR)}>
                −
              </button>
              <button type="button" aria-label="Reset view" onClick={resetView}>
                ⟲
              </button>
            </div>
          ) : null}
        </>
      }
    >
      {(grid?.lines ?? "both") === "both" && xAxisLabels && xAxisLabels.length > 1 ? (
        <GridColumns
          className="bbn-liq-grid"
          scale={timeScale}
          height={layout.plotHeight}
          tickValues={xAxisLabels.map((_, i) => i / (xAxisLabels.length - 1)).slice(1)}
          aria-hidden
        />
      ) : null}

      {/* Candle marks, right of the band gutter. */}
      <Group left={gutterWidth}>
        {seriesStyle !== "candles" && candleGeom.length > 0 ? (
          <>
            {seriesStyle === "area" ? (
              // The fill reaches both region edges via synthetic bottom-corner
              // points, matching the old full-width polygon; the stroked line
              // below spans only the candle centers.
              <AreaClosed<SeriesPoint>
                className="bbn-liq-series__area"
                data={[
                  { x: 0, y: layout.plotHeight },
                  ...candleGeom.map((g) => ({ x: g.center, y: priceScale(g.candle.close) })),
                  { x: regionWidth, y: layout.plotHeight },
                ]}
                x={(p) => p.x}
                y={(p) => p.y}
                y0={layout.plotHeight}
                yScale={priceScale}
              />
            ) : null}
            <LinePath<CandleGeom>
              className="bbn-liq-series__line"
              data={candleGeom}
              x={(g) => g.center}
              y={(g) => priceScale(g.candle.close)}
            />
          </>
        ) : (
          candleGeom.map((g) => (
            <Group
              key={g.key}
              className={g.bullish ? "bbn-liq-candle--up" : "bbn-liq-candle--down"}
              data-testid="liq-candle"
            >
              <Line
                className="bbn-liq-candle__wick"
                from={{ x: g.center, y: g.wickTop }}
                to={{ x: g.center, y: g.wickBottom }}
              />
              <Bar
                className="bbn-liq-candle__body"
                x={g.bodyLeft}
                y={g.bodyTop}
                width={g.bodyWidth}
                height={g.bodyHeight}
                rx={1}
              />
            </Group>
          ))
        )}

        {hovered ? (
          <Line
            className="bbn-liq-crosshair"
            from={{ x: hovered.center, y: 0 }}
            to={{ x: hovered.center, y: layout.plotHeight }}
            aria-hidden
          />
        ) : null}
      </Group>

      {bandGutter ? (
        <SeizureGutter
          bands={bands}
          priceScale={priceScale}
          width={gutterWidth}
          plotHeight={layout.plotHeight}
          fontAxis={layout.fontAxis}
          fontLabel={layout.fontLabel}
          fontAmount={layout.fontAmount}
          safeZone={safeZone}
          compact={compact}
          hideBandLabels={Boolean(hideBandLabels)}
        />
      ) : null}

      {/* Interaction surface over the candle region. */}
      <Bar
        innerRef={hitRef}
        className={interactive ? "bbn-liq-candles__hit bbn-liq-candles__hit--interactive" : "bbn-liq-candles__hit"}
        x={gutterWidth}
        y={0}
        width={regionWidth}
        height={layout.plotHeight}
        fill="transparent"
        onPointerMove={interactive ? onPointerMove : undefined}
        onPointerLeave={crosshairEnabled ? () => setHoverIndex(null) : undefined}
        onPointerDown={panEnabled ? onPointerDown : undefined}
        onPointerUp={panEnabled ? endDrag : undefined}
        onPointerCancel={panEnabled ? endDrag : undefined}
        onDoubleClick={zoomEnabled ? resetView : undefined}
        data-dragging={panEnabled ? dragging : undefined}
      />
    </ChartFrame>
  );
}
