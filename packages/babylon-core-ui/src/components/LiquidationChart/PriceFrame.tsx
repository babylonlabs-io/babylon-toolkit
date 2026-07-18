import type { CSSProperties, ReactNode } from "react";
import { twJoin } from "tailwind-merge";
import type { ChartGridConfig, LiquidationBandTone, PriceAxisTick } from "./types";
import { pct } from "./scale";

/** Below this fraction from the top, the price label sits under the line so it
 * clears the top legend / price zone instead of overflowing above the plot. */
const PRICE_LABEL_BELOW_THRESHOLD = 0.08;

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
  priceLineColor,
  priceLineLabelColor,
  plotInsetLeft = 0,
  xAxisLabels,
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
              className="bbn-liq-chart__yaxis-label"
              style={{ top: pct(priceToFraction(tick.value)) }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        <div className="bbn-liq-chart__plot">
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
                className={twJoin("bbn-liq-chart__pill", m.tone && `bbn-liq-chart__pill--tone-${m.tone}`)}
                style={{ top: pct(m.fraction), ...pillEdge }}
              >
                {m.label}
              </span>
            </span>
          ))}

          {children}

          <span className="bbn-liq-chart__price-line" style={priceLineStyle} data-testid="liq-current-price-line">
            {!currentPricePill && showPriceLineLabel ? (
              <span
                className={twJoin(
                  "bbn-liq-chart__price-line-label",
                  labelBelow && "bbn-liq-chart__price-line-label--below",
                )}
              >
                {currentPriceLabel}
              </span>
            ) : null}
          </span>
          {currentPricePill ? (
            <span
              className="bbn-liq-chart__pill bbn-liq-chart__pill--current"
              style={{ top: pct(currentPriceTop), ...pillEdge }}
            >
              {currentPriceLabel}
            </span>
          ) : null}
        </div>
      </div>

      {xAxisLabels?.length ? (
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
