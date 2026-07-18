import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { twJoin } from "tailwind-merge";
import "./LiquidationChart.css";
import { PriceFrame, type LevelMarker } from "./PriceFrame";
import { SeizureGutter } from "./SeizureGutter";
import { linearFraction, pct, tickFraction } from "./scale";
import type { Candle, TimelineProps } from "./types";

/** Fraction of plot width reserved on the left for the liquidation bands. */
const BAND_GUTTER_FRAC = 0.22;
/** Candle body width as a fraction of its slot. */
const CANDLE_BODY_RATIO = 0.6;
/** Zoom floor: never show fewer candles than this. */
const MIN_ZOOM_CANDLES = 10;
const ZOOM_IN_FACTOR = 0.8;
const ZOOM_OUT_FACTOR = 1.25;

const defaultFormatPrice = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const defaultFormatTime = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

interface CandleGeom {
  key: number;
  candle: Candle;
  center: number; // fraction of the candle region [0,1]
  bodyLeft: number;
  bodyWidth: number;
  wickTop: number;
  wickHeight: number;
  bodyTop: number;
  bodyHeight: number;
  bullish: boolean;
}

function layoutCandles(candles: Candle[], priceMax: number, priceMin: number): CandleGeom[] {
  const slot = candles.length ? 1 / candles.length : 1;
  const bodyWidth = slot * CANDLE_BODY_RATIO;
  return candles.map((c, i) => {
    const center = (i + 0.5) * slot;
    const wickTop = linearFraction(priceMax, priceMin, c.high);
    const wickHeight = linearFraction(priceMax, priceMin, c.low) - wickTop;
    const bodyTop = linearFraction(priceMax, priceMin, Math.max(c.open, c.close));
    const bodyHeight = Math.max(linearFraction(priceMax, priceMin, Math.min(c.open, c.close)) - bodyTop, 0.004);
    return {
      key: c.time,
      candle: c,
      center,
      bodyLeft: center - bodyWidth / 2,
      bodyWidth,
      wickTop,
      wickHeight,
      bodyTop,
      bodyHeight,
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
  onBandClick,
  bandClickHint,
  className,
}: TimelineProps) {
  const compact = variant === "compact";
  const gutterFrac = bandGutter ? BAND_GUTTER_FRAC : 0;
  const priceMax = priceAxis[0]?.value ?? currentPrice;
  const priceMin = priceAxis[priceAxis.length - 1]?.value ?? 0;

  const priceToFraction = useCallback(
    (price: number) => linearFraction(priceMax, priceMin, price),
    [priceMax, priceMin],
  );

  // Visible window. `startIndex === null` means "pinned to the most recent
  // candles" — this survives candles arriving asynchronously and is the
  // default-view state that zoom-reset returns to.
  const zoomEnabled = Boolean(interactions?.zoom) && candles.length > MIN_ZOOM_CANDLES;
  const defaultWindow = Math.min(visibleCandles ?? candles.length, candles.length) || candles.length;
  const [windowOverride, setWindowOverride] = useState<number | null>(null);
  const windowSize = Math.max(
    1,
    Math.min(windowOverride ?? defaultWindow, candles.length) || 1,
  );
  const maxStart = Math.max(0, candles.length - windowSize);
  const [startIndex, setStartIndex] = useState<number | null>(null);
  const clampedStart = startIndex === null ? maxStart : Math.min(startIndex, maxStart);

  const panEnabled = Boolean(interactions?.pan) && candles.length > windowSize;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const regionRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; start: number } | null>(null);

  const windowed = useMemo(
    () => candles.slice(clampedStart, clampedStart + windowSize),
    [candles, clampedStart, windowSize],
  );
  const candleGeom = useMemo(() => layoutCandles(windowed, priceMax, priceMin), [windowed, priceMax, priceMin]);

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
    const el = regionRef.current;
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
          fraction: priceToFraction(b.priceTop),
          label: formatPrice(b.priceTop),
          tone: b.tone,
        })),
    [bands, priceToFraction, formatPrice, priceMax, priceMin],
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

  // Line/area path through closes, in the candle region's [0,100]² space.
  const seriesPoints = useMemo(() => {
    if (seriesStyle === "candles") return "";
    return candleGeom
      .map((g) => `${g.center * 100},${linearFraction(priceMax, priceMin, g.candle.close) * 100}`)
      .join(" ");
  }, [seriesStyle, candleGeom, priceMax, priceMin]);

  const regionFraction = (clientX: number) => {
    const el = regionRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current) {
      const el = regionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const deltaFrac = (e.clientX - drag.current.x) / rect.width;
      const deltaIndex = Math.round(deltaFrac * windowSize);
      const next = Math.min(maxStart, Math.max(0, drag.current.start - deltaIndex));
      setStartIndex(next === maxStart ? null : next);
      return;
    }
    if (crosshairEnabled) {
      const f = regionFraction(e.clientX);
      setHoverIndex(Math.min(windowed.length - 1, Math.max(0, Math.floor(f * windowed.length))));
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!panEnabled) return;
    drag.current = { x: e.clientX, start: clampedStart };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const endDrag = (e: React.PointerEvent) => {
    if (drag.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
  };

  const hovered = hoverIndex != null ? candleGeom[hoverIndex] : null;
  const interactive = crosshairEnabled || panEnabled || zoomEnabled;

  return (
    <PriceFrame
      priceAxis={priceAxis}
      priceToFraction={priceToFraction}
      currentPrice={currentPrice}
      currentPriceLabel={currentPriceLabel}
      axisSide="right"
      currentPricePill
      levelMarkers={levelMarkers}
      plotInsetLeft={gutterFrac}
      xAxisLabels={xAxisLabels}
      grid={grid}
      variant={variant}
      className={twJoin(hideBandLabels && "bbn-liq-chart--no-band-labels", className)}
    >
      {bandGutter ? (
        <SeizureGutter
          bands={bands}
          priceToFraction={priceToFraction}
          width={gutterFrac}
          safeZone={safeZone}
          compact={compact}
          onBandClick={onBandClick}
          bandClickHint={bandClickHint}
        />
      ) : null}

      {/* Candle + interaction region, right of the band gutter. */}
      <div
        ref={regionRef}
        className={interactive ? "bbn-liq-candles bbn-liq-candles--interactive" : "bbn-liq-candles"}
        style={{ left: pct(gutterFrac) }}
        onPointerMove={interactive ? onPointerMove : undefined}
        onPointerLeave={crosshairEnabled ? () => setHoverIndex(null) : undefined}
        onPointerDown={panEnabled ? onPointerDown : undefined}
        onPointerUp={panEnabled ? endDrag : undefined}
        onDoubleClick={zoomEnabled ? resetView : undefined}
        data-dragging={panEnabled ? Boolean(drag.current) : undefined}
      >
        {/* Vertical gridlines at the time ticks. */}
        {xAxisLabels && xAxisLabels.length > 1
          ? xAxisLabels.map((label, i) =>
              i === 0 ? null : (
                <span
                  key={`${label}-${i}`}
                  className="bbn-liq-chart__vgridline"
                  style={{ left: pct(tickFraction(i, xAxisLabels.length)) }}
                  aria-hidden
                />
              ),
            )
          : null}

        {seriesStyle !== "candles" && seriesPoints ? (
          <svg className="bbn-liq-series" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {seriesStyle === "area" ? (
              <polygon className="bbn-liq-series__area" points={`0,100 ${seriesPoints} 100,100`} />
            ) : null}
            <polyline className="bbn-liq-series__line" points={seriesPoints} />
          </svg>
        ) : (
          candleGeom.map((g) => (
            <span key={g.key} data-testid="liq-candle">
              <span
                className={g.bullish ? "bbn-liq-candle__wick bbn-liq-candle__wick--up" : "bbn-liq-candle__wick bbn-liq-candle__wick--down"}
                style={{ left: pct(g.center), top: pct(g.wickTop), height: pct(g.wickHeight) }}
              />
              <span
                className={g.bullish ? "bbn-liq-candle__body bbn-liq-candle__body--up" : "bbn-liq-candle__body bbn-liq-candle__body--down"}
                style={{ left: pct(g.bodyLeft), width: pct(g.bodyWidth), top: pct(g.bodyTop), height: pct(g.bodyHeight) }}
              />
            </span>
          ))
        )}

        {hovered ? (
          <>
            <span className="bbn-liq-crosshair" style={{ left: pct(hovered.center) }} aria-hidden />
            <div
              className={hovered.center > 0.6 ? "bbn-liq-readout bbn-liq-readout--left" : "bbn-liq-readout"}
              style={{ left: pct(hovered.center) }}
            >
              <span className="bbn-liq-readout__time">{formatTime(hovered.candle.time)}</span>
              <span className="bbn-liq-readout__row"><span>O</span><span>{formatPrice(hovered.candle.open)}</span></span>
              <span className="bbn-liq-readout__row"><span>H</span><span>{formatPrice(hovered.candle.high)}</span></span>
              <span className="bbn-liq-readout__row"><span>L</span><span>{formatPrice(hovered.candle.low)}</span></span>
              <span className="bbn-liq-readout__row"><span>C</span><span>{formatPrice(hovered.candle.close)}</span></span>
            </div>
          </>
        ) : null}

        {zoomEnabled ? (
          <div className="bbn-liq-zoom">
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
      </div>
    </PriceFrame>
  );
}
