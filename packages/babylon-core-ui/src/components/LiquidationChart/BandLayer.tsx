import { useRef, useState } from "react";
import { twJoin } from "tailwind-merge";
import { Popover } from "@/components/Popover";
import type { LiquidationBand } from "./types";
import { pct } from "./scale";

const HOVER_CLOSE_DELAY_MS = 120;

export interface BandLayerProps {
  bands: LiquidationBand[];
  /** price → vertical fraction [0,1] within the plot. */
  priceToFraction: (price: number) => number;
  /** band → horizontal extent as fractions [0,1] of the plot width. */
  bandX: (band: LiquidationBand) => { left: number; width: number };
  /**
   * Optional vertical override (fractions [0,1]). Defaults to the price
   * mapping; the Timeline passes stacked geometry so off-scale bands stay
   * visible instead of collapsing at the plot floor.
   */
  bandY?: (band: LiquidationBand) => { top: number; height: number };
  compact: boolean;
  onBandClick?: (key: string) => void;
  bandClickHint?: string;
}

export function BandLayer({
  bands,
  priceToFraction,
  bandX,
  bandY,
  compact,
  onBandClick,
  bandClickHint,
}: BandLayerProps) {
  const [hovered, setHovered] = useState<{ band: LiquidationBand; anchor: HTMLElement } | null>(null);
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
      {bands.map((band) => {
        const { left, width } = bandX(band);
        const { top, height } = bandY
          ? bandY(band)
          : {
              top: priceToFraction(band.priceTop),
              height: priceToFraction(band.priceBottom) - priceToFraction(band.priceTop),
            };
        const liquidated = band.state === "liquidated";
        const interactive = Boolean(onBandClick || band.popoverMetrics?.length);
        return (
          <div
            key={band.key}
            className={twJoin(
              "bbn-liq-band",
              `bbn-liq-band--tone-${band.tone}`,
              liquidated && "bbn-liq-band--liquidated",
              interactive && "bbn-liq-band--interactive",
            )}
            style={{ left: pct(left), width: pct(width), top: pct(top), height: pct(height) }}
            data-testid={`liq-band-${band.key}`}
            onMouseEnter={(e) => {
              cancelClose();
              if (band.popoverMetrics?.length) setHovered({ band, anchor: e.currentTarget });
            }}
            onMouseLeave={scheduleClose}
            onClick={onBandClick ? () => onBandClick(band.key) : undefined}
            role={onBandClick ? "button" : undefined}
            tabIndex={onBandClick ? 0 : undefined}
            onKeyDown={
              onBandClick
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onBandClick(band.key);
                    }
                  }
                : undefined
            }
          >
            <span className="bbn-liq-band__label">{band.label}</span>
            {!compact && band.sublabel ? (
              <span className="bbn-liq-band__sublabel">{band.sublabel}</span>
            ) : null}
            <span className="bbn-liq-band__amount">{band.amountLabel}</span>
          </div>
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
          <div
            className="bbn-liq-popover__inner"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <span className={`bbn-liq-popover__chip bbn-liq-popover__chip--tone-${hovered.band.tone}`}>
              {hovered.band.label}
            </span>
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
            {onBandClick && bandClickHint ? (
              <button
                type="button"
                className="bbn-liq-popover__cta"
                onClick={() => {
                  onBandClick(hovered.band.key);
                  setHovered(null);
                }}
              >
                {bandClickHint} ↓
              </button>
            ) : null}
          </div>
        ) : null}
      </Popover>
    </>
  );
}
