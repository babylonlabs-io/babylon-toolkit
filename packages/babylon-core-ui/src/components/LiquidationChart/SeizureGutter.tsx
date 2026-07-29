import { useId, useMemo } from "react";
import { Bar } from "@visx/shape";
import { Group } from "@visx/group";
import { Text } from "@visx/text";
import { BandLayer, type BandRect } from "./BandLayer";
import {
  BAND_RADIUS_PX,
  SAFEZONE_BORDER_PX,
  SAFEZONE_LINE_GAP_PX,
  SAFEZONE_PAD_X_PX,
  SAFEZONE_PAD_Y_PX,
  TEXT_LINE_HEIGHT,
} from "./chartGeometry";
import type { PriceScale } from "./priceScale";
import { chartFont, truncateToWidth } from "./textMeasure";
import type { LiquidationBand, SafeZone } from "./types";

/** Minimum band height (plot fraction) so a band stays visible/hoverable. */
const MIN_BAND_FRAC = 0.06;

export interface SeizureGutterProps {
  bands: LiquidationBand[];
  priceScale: PriceScale;
  /** Gutter width in px. */
  width: number;
  /** Plot height in px, for the clip rect. */
  plotHeight: number;
  fontAxis: number;
  fontLabel: number;
  fontAmount: number;
  safeZone?: SafeZone;
  compact: boolean;
  hideBandLabels: boolean;
}

/**
 * The pluggable seizure-map column inside the Timeline: safe zone on top,
 * then the liquidation bands. Each band's TOP is anchored exactly at its
 * trigger price; bands extend downward (with a minimum height) and anything
 * past the plot floor is clipped by this group — events below the visible
 * price domain are simply out of frame. Extend the price axis to reveal them.
 */
export function SeizureGutter({
  bands,
  priceScale,
  width,
  plotHeight,
  fontAxis,
  fontLabel,
  fontAmount,
  safeZone,
  compact,
  hideBandLabels,
}: SeizureGutterProps) {
  const clipId = useId();

  const bandGeom = useMemo(() => {
    const geoms = new Map<string, { top: number; height: number }>();
    const minHeight = MIN_BAND_FRAC * plotHeight;
    let cursor = 0;
    for (const b of bands) {
      // Anchor at the true price; `cursor` only prevents overlap when a
      // previous band's minimum height ran past this band's trigger.
      const top = Math.max(priceScale(b.priceTop), cursor);
      const bottom = Math.max(priceScale(b.priceBottom), top + minHeight);
      geoms.set(b.key, { top, height: bottom - top });
      cursor = bottom;
    }
    return geoms;
  }, [bands, priceScale, plotHeight]);

  const firstBandTop = bands.length ? (bandGeom.get(bands[0].key)?.top ?? 0) : 0;
  const bandRect = (b: LiquidationBand): BandRect => {
    const geom = bandGeom.get(b.key) ?? { top: 0, height: 0 };
    return { x: 0, y: geom.top, width, height: geom.height };
  };

  // Safe-zone text stack: title always; the detail lines render whenever the
  // full stack fits the box's content area (height minus padding and border),
  // and drop together when it would overflow.
  const showSafeZone = Boolean(safeZone) && bands.length > 0;
  const safeZoneContentHeight = firstBandTop - 2 * (SAFEZONE_PAD_Y_PX + SAFEZONE_BORDER_PX);
  const titleHeight = Math.round(fontLabel * TEXT_LINE_HEIGHT);
  const safeLineHeight = Math.round(fontAxis * TEXT_LINE_HEIGHT);
  const fullStackHeight = titleHeight + (safeZone?.lines.length ?? 0) * (safeLineHeight + SAFEZONE_LINE_GAP_PX);
  const safeLines = showSafeZone && safeZone && fullStackHeight <= safeZoneContentHeight ? safeZone.lines : [];
  const safeStackHeight = titleHeight + safeLines.length * (safeLineHeight + SAFEZONE_LINE_GAP_PX);
  const safeMaxTextWidth = width - 2 * SAFEZONE_PAD_X_PX;

  return (
    <Group clipPath={`url(#${clipId})`}>
      <clipPath id={clipId}>
        <rect x={0} y={0} width={width} height={plotHeight} />
      </clipPath>

      {showSafeZone && safeZone ? (
        <g>
          <Bar className="bbn-liq-safezone__rect" x={0} y={0} width={width} height={firstBandTop} rx={BAND_RADIUS_PX} />
          <g pointerEvents="none">
            <Text
              className="bbn-liq-safezone__title"
              x={width / 2}
              y={(firstBandTop - safeStackHeight) / 2}
              textAnchor="middle"
              verticalAnchor="start"
              fontSize={fontLabel}
            >
              {truncateToWidth(safeZone.title, chartFont(fontLabel), safeMaxTextWidth)}
            </Text>
            {safeLines.map((line, i) => (
              <Text
                key={line}
                className="bbn-liq-safezone__line"
                x={width / 2}
                y={
                  (firstBandTop - safeStackHeight) / 2 +
                  titleHeight +
                  SAFEZONE_LINE_GAP_PX +
                  i * (safeLineHeight + SAFEZONE_LINE_GAP_PX)
                }
                textAnchor="middle"
                verticalAnchor="start"
                fontSize={fontAxis}
              >
                {truncateToWidth(line, chartFont(fontAxis), safeMaxTextWidth)}
              </Text>
            ))}
          </g>
        </g>
      ) : null}

      <BandLayer
        bands={bands}
        bandRect={bandRect}
        fontLabel={fontLabel}
        fontAmount={fontAmount}
        compact={compact}
        hideBandLabels={hideBandLabels}
      />
    </Group>
  );
}
