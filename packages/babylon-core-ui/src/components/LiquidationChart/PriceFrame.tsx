import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { twJoin } from "tailwind-merge";
import type { ChartGridConfig, LiquidationBandTone, PriceAxisTick } from "./types";
import { declutterCenters } from "./axisDeclutter";
import { pct } from "./scale";

/** Below this fraction from the top, the price label sits under the line so it
 * clears the top legend / price zone instead of overflowing above the plot. */
const PRICE_LABEL_BELOW_THRESHOLD = 0.08;

/** Declutter key for the current-price pill (level markers use their band key). */
const CURRENT_PILL_KEY = "__current__";

/** An axis tick placed at an explicit fraction [0,1] of the plot. */
export interface AxisTick {
  fraction: number;
  label: string;
}

/** A tone-coloured horizontal level (dashed line + axis pill). */
export interface LevelMarker {
  key: string;
  fraction: number;
  label: string;
  tone?: LiquidationBandTone;
}

export interface PriceFrameProps {
  priceAxis: PriceAxisTick[];
  priceToFraction: (price: number) => number;
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
   * Fraction of plot width where gridlines/level lines/price line/x-axis begin.
   * Timeline sets this to the band-gutter width so lines don't cross the gutter.
   */
  plotInsetLeft?: number;
  /** X-axis tick labels, evenly distributed under the plot. */
  xAxisLabels?: string[];
  /** X-axis ticks at explicit fractions; takes precedence over `xAxisLabels`. */
  xAxisTicks?: AxisTick[];
  grid?: ChartGridConfig;
  variant: "full" | "compact";
  className?: string;
  /** Strip above the plot (Seizure Map collateral-share legend). */
  topLegend?: ReactNode;
  /** Marks rendered inside the plot area (bands, candles, safe zone, crosshair). */
  children: ReactNode;
}

export function PriceFrame({
  priceAxis,
  priceToFraction,
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
  variant,
  className,
  topLegend,
  children,
}: PriceFrameProps) {
  const currentPriceTop = priceToFraction(currentPrice);
  const pillEdge = axisSide === "right" ? { right: 0 } : { left: 0 };
  const lineInset = plotInsetLeft > 0 ? { left: pct(plotInsetLeft) } : undefined;
  const labelBelow = currentPriceTop < PRICE_LABEL_BELOW_THRESHOLD;
  const priceLineStyle: CSSProperties = {
    top: pct(currentPriceTop),
    ...lineInset,
    ...(priceLineColor ? { "--liq-price-line": priceLineColor } : {}),
    ...(priceLineLabelColor ? { "--liq-price-line-label": priceLineLabelColor } : {}),
  };

  // Every right-axis price pill (liquidation levels + current price) as one
  // ordered set, so a measured pass can push overlapping labels apart instead
  // of letting them stack unreadably. The dashed level/price lines stay put at
  // the true price; only the label moves.
  const pills = useMemo(() => {
    const list = (levelMarkers ?? []).map((m) => ({ key: m.key, fraction: m.fraction }));
    if (currentPricePill) list.push({ key: CURRENT_PILL_KEY, fraction: currentPriceTop });
    return list;
  }, [levelMarkers, currentPricePill, currentPriceTop]);

  const plotRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [layout, setLayout] = useState<{ tops: Map<string, number>; hiddenTicks: Set<number> } | null>(null);

  useLayoutEffect(() => {
    const plot = plotRef.current;
    if (!plot || pills.length === 0) {
      setLayout(null);
      return;
    }
    const measure = () => {
      const h = plot.clientHeight;
      if (!h) return;
      const items = pills.map((p) => ({
        key: p.key,
        center: p.fraction * h,
        height: pillRefs.current.get(p.key)?.offsetHeight ?? 0,
      }));
      const tops = declutterCenters(items, h);
      // Hide the round-number axis tick a pill now sits on: the pill labels that
      // height precisely, so the tick behind it is redundant and just clutters.
      const hiddenTicks = new Set<number>();
      for (const tick of priceAxis) {
        const tc = priceToFraction(tick.value) * h;
        for (const it of items) {
          const top = tops.get(it.key);
          if (top != null && Math.abs(top - tc) < it.height) {
            hiddenTicks.add(tick.value);
            break;
          }
        }
      }
      setLayout({ tops, hiddenTicks });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(plot);
    return () => observer.disconnect();
  }, [pills, priceAxis, priceToFraction]);

  const pillTop = (key: string, fraction: number): string => {
    const top = layout?.tops.get(key);
    return top != null ? `${top}px` : pct(fraction);
  };
  const setPillRef = (key: string) => (el: HTMLElement | null) => {
    if (el) pillRefs.current.set(key, el);
    else pillRefs.current.delete(key);
  };

  return (
    <div
      className={twJoin(
        "bbn-liq-chart",
        `bbn-liq-chart--${variant}`,
        `bbn-liq-chart--axis-${axisSide}`,
        `bbn-liq-chart--grid-${grid?.lines ?? "both"}`,
        `bbn-liq-chart--gridstyle-${grid?.style ?? "dashed"}`,
        className,
      )}
    >
      {topLegend ? <div className="bbn-liq-chart__top-legend">{topLegend}</div> : null}

      <div className="bbn-liq-chart__body">
        <div className="bbn-liq-chart__yaxis" aria-hidden>
          {priceAxis.map((tick) => (
            <span
              key={tick.value}
              className={twJoin(
                "bbn-liq-chart__yaxis-label",
                layout?.hiddenTicks.has(tick.value) && "bbn-liq-chart__yaxis-label--hidden",
              )}
              style={{ top: pct(priceToFraction(tick.value)) }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        <div className="bbn-liq-chart__plot" ref={plotRef}>
          {priceAxis.map((tick) => (
            <span
              key={tick.value}
              className="bbn-liq-chart__gridline"
              style={{ top: pct(priceToFraction(tick.value)), ...lineInset }}
              aria-hidden
            />
          ))}

          {levelMarkers?.map((m) => (
            <span key={m.key} aria-hidden>
              <span
                className={twJoin("bbn-liq-chart__level-line", m.tone && `bbn-liq-chart__level-line--tone-${m.tone}`)}
                style={{ top: pct(m.fraction), ...lineInset }}
              />
              <span
                ref={setPillRef(m.key)}
                className={twJoin("bbn-liq-chart__pill", m.tone && `bbn-liq-chart__pill--tone-${m.tone}`)}
                style={{ top: pillTop(m.key, m.fraction), ...pillEdge }}
              >
                {m.label}
              </span>
            </span>
          ))}

          {children}

          <span className="bbn-liq-chart__price-line" style={priceLineStyle} data-testid="liq-current-price-line">
            {!currentPricePill && showPriceLineLabel ? (
              <>
                {priceLineCaption ? (
                  <span
                    className={twJoin(
                      "bbn-liq-chart__price-line-caption",
                      labelBelow && "bbn-liq-chart__price-line-caption--below",
                    )}
                  >
                    {priceLineCaption}
                  </span>
                ) : null}
                <span
                  className={twJoin(
                    "bbn-liq-chart__price-line-label",
                    labelBelow && "bbn-liq-chart__price-line-label--below",
                  )}
                >
                  {currentPriceLabel}
                </span>
              </>
            ) : null}
          </span>
          {currentPricePill ? (
            <span
              ref={setPillRef(CURRENT_PILL_KEY)}
              className="bbn-liq-chart__pill bbn-liq-chart__pill--current"
              style={{ top: pillTop(CURRENT_PILL_KEY, currentPriceTop), ...pillEdge }}
            >
              {currentPriceLabel}
            </span>
          ) : null}
        </div>
      </div>

      {xAxisTicks?.length ? (
        <div className="bbn-liq-chart__xaxis bbn-liq-chart__xaxis--positioned" aria-hidden>
          {xAxisTicks.map((tick, index) => (
            <span
              key={`${tick.label}-${tick.fraction}`}
              className={twJoin(
                "bbn-liq-chart__xaxis-label",
                index === 0 && "bbn-liq-chart__xaxis-label--first",
                index === xAxisTicks.length - 1 && "bbn-liq-chart__xaxis-label--last",
              )}
              // Folded into `left` rather than applied as padding: these spans are
              // absolutely positioned, so a percentage resolves against the padding
              // box and padding would rescale them instead of shifting them.
              style={{ left: pct(plotInsetLeft + tick.fraction * (1 - plotInsetLeft)) }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      ) : xAxisLabels?.length ? (
        <div
          className="bbn-liq-chart__xaxis"
          style={plotInsetLeft > 0 ? { paddingLeft: pct(plotInsetLeft) } : undefined}
          aria-hidden
        >
          {xAxisLabels.map((label) => (
            <span key={label} className="bbn-liq-chart__xaxis-label">
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
