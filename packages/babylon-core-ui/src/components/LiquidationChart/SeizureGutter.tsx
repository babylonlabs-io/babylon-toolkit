import { useMemo } from "react";
import { BandLayer } from "./BandLayer";
import { pct } from "./scale";
import type { LiquidationBand, SafeZone } from "./types";

/** Minimum band height (plot fraction) so a band stays visible/hoverable. */
const MIN_BAND_FRAC = 0.06;

export interface SeizureGutterProps {
  bands: LiquidationBand[];
  /** price → vertical fraction [0,1] within the plot. */
  priceToFraction: (price: number) => number;
  /** Gutter width as a fraction of the plot. */
  width: number;
  safeZone?: SafeZone;
  compact: boolean;
  onBandClick?: (key: string) => void;
  bandClickHint?: string;
}

/**
 * The pluggable seizure-map column inside the Timeline: safe zone on top,
 * then the liquidation bands. Each band's TOP is anchored exactly at its
 * trigger price; bands extend downward (with a minimum height) and anything
 * past the plot floor is clipped by this wrapper — events below the visible
 * price domain are simply out of frame, like Figma. Extend the price axis
 * to reveal them.
 */
export function SeizureGutter({
  bands,
  priceToFraction,
  width,
  safeZone,
  compact,
  onBandClick,
  bandClickHint,
}: SeizureGutterProps) {
  const bandGeom = useMemo(() => {
    const geoms = new Map<string, { top: number; height: number }>();
    let cursor = 0;
    for (const b of bands) {
      // Anchor at the true price; `cursor` only prevents overlap when a
      // previous band's minimum height ran past this band's trigger.
      const top = Math.max(priceToFraction(b.priceTop), cursor);
      const bottom = Math.max(priceToFraction(b.priceBottom), top + MIN_BAND_FRAC);
      geoms.set(b.key, { top, height: bottom - top });
      cursor = bottom;
    }
    return geoms;
  }, [bands, priceToFraction]);

  const firstBandTop = bands.length ? (bandGeom.get(bands[0].key)?.top ?? 0) : 0;

  return (
    <div className="bbn-liq-gutter" style={{ width: pct(width) }}>
      {safeZone && bands.length ? (
        <div className="bbn-liq-safezone" style={{ height: pct(firstBandTop) }}>
          <span className="bbn-liq-safezone__title">{safeZone.title}</span>
          {safeZone.lines.map((line) => (
            <span key={line} className="bbn-liq-safezone__line">
              {line}
            </span>
          ))}
        </div>
      ) : null}

      <BandLayer
        bands={bands}
        priceToFraction={priceToFraction}
        bandX={() => ({ left: 0, width: 1 })}
        bandY={(b) => bandGeom.get(b.key) ?? { top: 0, height: 0 }}
        compact={compact}
        onBandClick={onBandClick}
        bandClickHint={bandClickHint}
      />
    </div>
  );
}
