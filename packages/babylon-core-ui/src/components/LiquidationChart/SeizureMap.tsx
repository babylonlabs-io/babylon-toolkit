import { useCallback } from "react";
import { twJoin } from "tailwind-merge";
import "./LiquidationChart.css";
import { BandLayer } from "./BandLayer";
import { PriceFrame } from "./PriceFrame";
import { segmentedFraction, pct } from "./scale";
import type { LiquidationBand, SeizureMapProps } from "./types";

/** Collateral-share legend strip above the plot (0.6 BTC / 0.4 BTC / …). */
function ShareLegend({ bands }: { bands: LiquidationBand[] }) {
  return (
    <>
      {bands.map((band) => (
        <span
          key={band.key}
          className={`bbn-liq-legend-seg bbn-liq-legend-seg--tone-${band.tone}`}
          style={{ width: pct(band.shareEnd - band.shareStart) }}
        >
          {band.amountLabel}
        </span>
      ))}
    </>
  );
}

export function SeizureMap({
  bands,
  currentPrice,
  currentPriceLabel,
  priceAxis,
  shareAxisLabels,
  variant = "full",
  grid,
  showPriceLineLabel,
  priceLineColor,
  priceLineLabelColor,
  hideBandLabels,
  onBandClick,
  bandClickHint,
  className,
}: SeizureMapProps) {
  const compact = variant === "compact";
  const priceToFraction = useCallback((price: number) => segmentedFraction(priceAxis, price), [priceAxis]);

  return (
    <PriceFrame
      priceAxis={priceAxis}
      priceToFraction={priceToFraction}
      currentPrice={currentPrice}
      currentPriceLabel={currentPriceLabel}
      xAxisLabels={compact ? undefined : shareAxisLabels}
      grid={grid}
      showPriceLineLabel={showPriceLineLabel}
      priceLineColor={priceLineColor}
      priceLineLabelColor={priceLineLabelColor}
      variant={variant}
      className={twJoin(hideBandLabels && "bbn-liq-chart--no-band-labels", className)}
      topLegend={compact ? undefined : <ShareLegend bands={bands} />}
    >
      {/* Vertical gridlines at the band boundaries (Figma "Background Chart"). */}
      {[0, ...bands.map((b) => b.shareEnd)].map((f) => (
        <span key={f} className="bbn-liq-chart__vgridline" style={{ left: pct(f) }} aria-hidden />
      ))}
      <BandLayer
        bands={bands}
        priceToFraction={priceToFraction}
        bandX={(b) => ({ left: b.shareStart, width: b.shareEnd - b.shareStart })}
        compact={compact}
        onBandClick={onBandClick}
        bandClickHint={bandClickHint}
      />
    </PriceFrame>
  );
}
