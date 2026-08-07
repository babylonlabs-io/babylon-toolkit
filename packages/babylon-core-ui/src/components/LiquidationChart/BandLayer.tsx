import { useId, useRef, useState } from "react";
import { Bar } from "@visx/shape";
import { Group } from "@visx/group";
import { Text } from "@visx/text";
import { twJoin } from "tailwind-merge";
import { Popover } from "@/components/Popover";
import {
  BAND_LINE_GAP_PX,
  BAND_PAD_X_PX,
  BAND_PAD_Y_PX,
  DROP_AMOUNT_MAX_PX,
  DROP_LABEL_MAX_PX,
  DROP_SUBLABEL_MAX_PX,
} from "./chartGeometry";
import { TEXT_LINE_HEIGHT } from "../charts/chartLayout";
import { chartFont, truncateToWidth } from "../charts/textMeasure";
import type { LiquidationBand } from "./types";

const HOVER_CLOSE_DELAY_MS = 120;

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
  /**
   * Overrides which bands render dimmed. Defaults to the band's `state`; the
   * Timeline gutter dims geometrically instead, because its blocks can extend
   * past the price domain. The liquidated text swap always follows `state`.
   */
  isDimmed?: (band: LiquidationBand) => boolean;
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
  isDimmed,
}: BandLayerProps) {
  const clipBaseId = useId();
  const [hovered, setHovered] = useState<{ band: LiquidationBand; anchor: Element } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setHovered(null), HOVER_CLOSE_DELAY_MS);
  };

  return (
    <>
      {bands.map((band, index) => {
        const rect = bandRect(band);
        const dimmed = isDimmed ? isDimmed(band) : band.state === "liquidated";
        const hoverable = Boolean(band.popoverMetrics?.length);
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
        // Keyed by index, not `band.key`: the key is caller-supplied and a
        // quote or space would make the `url(#…)` reference silently drop the
        // whole clipped group.
        const clipId = `${clipBaseId}-${index}`;
        const lineTops: number[] = [];
        let nextTop = rect.y + (rect.height - stackHeight) / 2;
        for (const lineHeight of lineHeights) {
          lineTops.push(nextTop);
          nextTop += lineHeight + BAND_LINE_GAP_PX;
        }
        return (
          <Group
            key={band.key}
            className={twJoin(
              "bbn-liq-band",
              dimmed && "bbn-liq-band--liquidated",
              hoverable && "bbn-liq-band--interactive",
            )}
          >
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
              // The tooltip is hover-only for pointers; focus gives keyboard
              // users the same detail. The band text is a sibling group, so
              // the rect names itself.
              tabIndex={hoverable ? 0 : undefined}
              aria-label={
                hoverable ? [band.label, band.sublabel, band.amountLabel].filter(Boolean).join(" ") : undefined
              }
              onMouseEnter={(e) => {
                cancelClose();
                if (band.popoverMetrics?.length) setHovered({ band, anchor: e.currentTarget });
              }}
              onMouseLeave={scheduleClose}
              onFocus={(e) => {
                cancelClose();
                if (band.popoverMetrics?.length) setHovered({ band, anchor: e.currentTarget });
              }}
              onBlur={scheduleClose}
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

      <Popover
        open={Boolean(hovered)}
        anchorEl={hovered?.anchor ?? null}
        placement="right-start"
        offset={[0, 8]}
        className="bbn-liq-popover"
        onClickOutside={() => setHovered(null)}
      >
        {hovered ? (
          <div className="bbn-liq-popover__inner" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
            <span className="bbn-liq-popover__chip">{hovered.band.label}</span>
            <dl className="bbn-liq-popover__metrics">
              {hovered.band.popoverMetrics?.map((m) => (
                <div key={m.label} className="bbn-liq-popover__row">
                  <dt>{m.label}</dt>
                  <dd className={m.emphasis ? `bbn-liq-popover__value--tone-${hovered.band.tone}` : undefined}>
                    {m.value}
                  </dd>
                </div>
              ))}
            </dl>
            {hovered.band.cumulativeLabel ? (
              <div className="bbn-liq-popover__row bbn-liq-popover__row--footer">
                <dt>Cumulative</dt>
                <dd>{hovered.band.cumulativeLabel}</dd>
              </div>
            ) : null}
          </div>
        ) : null}
      </Popover>
    </>
  );
}
