import { useId } from "react";
import { Bar } from "@visx/shape";
import { Group } from "@visx/group";
import { Text } from "@visx/text";
import { twJoin } from "tailwind-merge";
import {
  BAND_LINE_GAP_PX,
  BAND_PAD_X_PX,
  BAND_PAD_Y_PX,
  DROP_AMOUNT_MAX_PX,
  DROP_LABEL_MAX_PX,
  DROP_SUBLABEL_MAX_PX,
  TEXT_LINE_HEIGHT,
} from "./chartGeometry";
import { chartFont, truncateToWidth } from "./textMeasure";
import type { LiquidationBand } from "./types";

/** A band's pixel rect inside the plot group. */
export interface BandRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BandTextLine {
  kind: "label" | "sublabel" | "amount" | "liquidated";
  text: string;
  fontSize: number;
}

export interface BandLayerProps {
  bands: LiquidationBand[];
  /** band → pixel rect inside the plot group. */
  bandRect: (band: LiquidationBand) => BandRect;
  fontLabel: number;
  fontAmount: number;
  compact: boolean;
  /** Hide all in-band text. */
  hideBandLabels: boolean;
  /** Replaces a liquidated band's sublabel + amount. See {@link LiquidationChartBase}. */
  liquidatedLabel?: string;
}

/** Text lines a band has room for. Replaces the old `@container (max-height)`
 * dropout queries — the band's pixel height is known, so the thresholds are
 * plain comparisons (`>`, since `max-height` matched at exactly the bound).
 * The queries evaluated the content box, so the padding comes off first. */
function visibleBandLines(
  band: LiquidationBand,
  heightPx: number,
  compact: boolean,
  hideAll: boolean,
  fontLabel: number,
  fontAmount: number,
  liquidatedLabel?: string,
): BandTextLine[] {
  if (hideAll) return [];
  const contentHeight = heightPx - 2 * BAND_PAD_Y_PX;
  const lines: BandTextLine[] = [];
  if (contentHeight > DROP_LABEL_MAX_PX) lines.push({ kind: "label", text: band.label, fontSize: fontLabel });
  if (band.state === "liquidated" && liquidatedLabel) {
    if (contentHeight > DROP_AMOUNT_MAX_PX) {
      lines.push({ kind: "liquidated", text: liquidatedLabel, fontSize: fontLabel });
    }
    return lines;
  }
  if (!compact && band.sublabel && contentHeight > DROP_SUBLABEL_MAX_PX) {
    lines.push({ kind: "sublabel", text: band.sublabel, fontSize: fontLabel });
  }
  if (contentHeight > DROP_AMOUNT_MAX_PX) lines.push({ kind: "amount", text: band.amountLabel, fontSize: fontAmount });
  return lines;
}

export function BandLayer({
  bands,
  bandRect,
  fontLabel,
  fontAmount,
  compact,
  hideBandLabels,
  liquidatedLabel,
}: BandLayerProps) {
  const clipBaseId = useId();

  return (
    <>
      {bands.map((band) => {
        const rect = bandRect(band);
        const liquidated = band.state === "liquidated";
        const lines = visibleBandLines(
          band,
          rect.height,
          compact,
          hideBandLabels,
          fontLabel,
          fontAmount,
          liquidatedLabel,
        );
        const lineHeights = lines.map((line) => Math.round(line.fontSize * TEXT_LINE_HEIGHT));
        const stackHeight =
          lineHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, lines.length - 1) * BAND_LINE_GAP_PX;
        const maxTextWidth = rect.width - 2 * BAND_PAD_X_PX;
        const clipId = `${clipBaseId}-${band.key}`;
        const lineTops: number[] = [];
        let nextTop = rect.y + (rect.height - stackHeight) / 2;
        for (const lineHeight of lineHeights) {
          lineTops.push(nextTop);
          nextTop += lineHeight + BAND_LINE_GAP_PX;
        }
        return (
          <Group key={band.key} className={twJoin("bbn-liq-band", liquidated && "bbn-liq-band--liquidated")}>
            <clipPath id={clipId}>
              <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
            </clipPath>
            <Bar
              className={twJoin("bbn-liq-band__rect", `bbn-liq-band__rect--tone-${band.tone}`)}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              data-testid={`liq-band-${band.key}`}
            />
            {lines.length > 0 ? (
              <g className="bbn-liq-band__text" clipPath={`url(#${clipId})`} pointerEvents="none">
                {lines.map((line, i) => (
                  <Text
                    key={line.kind}
                    x={rect.x + rect.width / 2}
                    y={lineTops[i]}
                    textAnchor="middle"
                    verticalAnchor="start"
                    fontSize={line.fontSize}
                  >
                    {truncateToWidth(line.text, chartFont(line.fontSize), maxTextWidth)}
                  </Text>
                ))}
              </g>
            ) : null}
          </Group>
        );
      })}
    </>
  );
}
