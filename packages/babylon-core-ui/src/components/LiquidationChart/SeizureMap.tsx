import { useMemo } from "react";
import { GridColumns } from "@visx/grid";
import { scaleLinear } from "@visx/scale";
import { Bar } from "@visx/shape";
import { Text } from "@visx/text";
import "./LiquidationChart.css";
import { BandLayer, type BandRect } from "./BandLayer";
import { ChartFrame, useChartLayout } from "./ChartFrame";
import { BAND_RADIUS_PX, LEGEND_GAP_PX, LEGEND_PAD_X_PX, type ChartLayout } from "./chartGeometry";
import { createSegmentedPriceScale } from "./priceScale";
import { chartFont, truncateToWidth } from "./textMeasure";
import type { LiquidationBand, SeizureMapProps } from "./types";

/** Collateral-share legend strip above the plot (0.6 BTC / 0.4 BTC / …). */
function ShareLegend({
  bands,
  shareScale,
  layout,
}: {
  bands: LiquidationBand[];
  shareScale: (share: number) => number;
  layout: ChartLayout;
}) {
  return (
    <>
      {bands.map((band, index) => {
        const x = shareScale(band.shareStart);
        const isLast = index === bands.length - 1;
        const width = Math.max(0, shareScale(band.shareEnd) - x - (isLast ? 0 : LEGEND_GAP_PX));
        return (
          <g key={band.key}>
            <Bar
              className={`bbn-liq-legend__rect bbn-liq-legend__rect--tone-${band.tone}`}
              x={x}
              y={0}
              width={width}
              height={layout.legendHeight}
              rx={BAND_RADIUS_PX}
            />
            <Text
              className="bbn-liq-legend__text"
              x={x + width / 2}
              y={layout.legendHeight / 2}
              textAnchor="middle"
              verticalAnchor="middle"
              fontSize={layout.fontLabel}
              pointerEvents="none"
            >
              {truncateToWidth(band.amountLabel, chartFont(layout.fontLabel), width - 2 * LEGEND_PAD_X_PX)}
            </Text>
          </g>
        );
      })}
    </>
  );
}

export function SeizureMap({
  bands,
  currentPrice,
  currentPriceLabel,
  priceAxis,
  shareAxisLabels,
  shareAxisTicks,
  showShareLegend = true,
  variant = "full",
  grid,
  showPriceLineLabel,
  priceLineCaption,
  priceLineColor,
  priceLineLabelColor,
  hideBandLabels,
  className,
}: SeizureMapProps) {
  const compact = variant === "compact";
  const hasTopLegend = !compact && showShareLegend && bands.length > 0;
  const hasXAxis = !compact && Boolean(shareAxisTicks?.length || shareAxisLabels?.length);
  const { parentRef, layout } = useChartLayout({ axisSide: "left", hasTopLegend, hasXAxis });

  const priceScale = useMemo(
    () => createSegmentedPriceScale(priceAxis, layout.plotHeight),
    [priceAxis, layout.plotHeight],
  );
  const shareScale = useMemo(
    () => scaleLinear<number>({ domain: [0, 1], range: [0, layout.plotWidth] }),
    [layout.plotWidth],
  );

  const bandRect = (b: LiquidationBand): BandRect => {
    const x = shareScale(b.shareStart);
    const y = priceScale(b.priceTop);
    return {
      x,
      y,
      width: shareScale(b.shareEnd) - x,
      height: priceScale(b.priceBottom) - y,
    };
  };

  return (
    <ChartFrame
      parentRef={parentRef}
      layout={layout}
      priceAxis={priceAxis}
      priceScale={priceScale}
      currentPrice={currentPrice}
      currentPriceLabel={currentPriceLabel}
      xAxisLabels={compact ? undefined : shareAxisLabels}
      xAxisTicks={compact ? undefined : shareAxisTicks}
      grid={grid}
      showPriceLineLabel={showPriceLineLabel}
      priceLineCaption={priceLineCaption}
      priceLineColor={priceLineColor}
      priceLineLabelColor={priceLineLabelColor}
      className={className}
      topLegend={hasTopLegend ? <ShareLegend bands={bands} shareScale={shareScale} layout={layout} /> : undefined}
    >
      {(grid?.lines ?? "both") === "both" ? (
        <GridColumns
          className="bbn-liq-grid"
          scale={shareScale}
          height={layout.plotHeight}
          tickValues={[0, ...bands.map((b) => b.shareEnd)]}
          aria-hidden
        />
      ) : null}
      <BandLayer
        bands={bands}
        bandRect={bandRect}
        fontLabel={layout.fontLabel}
        fontAmount={layout.fontAmount}
        compact={compact}
        hideBandLabels={Boolean(hideBandLabels)}
      />
    </ChartFrame>
  );
}
