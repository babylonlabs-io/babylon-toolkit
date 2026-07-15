import { useLayoutEffect, useRef, useState } from "react";

import { COPY } from "@/copy";

import {
  computeRailLayout,
  spreadLabelCenters,
  type RiskDisplayState,
} from "./railLayout";

interface RiskPriceRailProps {
  state: RiskDisplayState;
  currentPriceUsd: number | null;
  liquidationPriceUsd: number | null;
  currentPriceText: string;
  liquidationPriceText: string;
  pctToLiquidationText: string;
}

const RAIL_TOP_PX = 84;
const RAIL_HEIGHT_PX = 4;
const RAIL_CENTER_PX = RAIL_TOP_PX + RAIL_HEIGHT_PX / 2;
const TICK_STROKE_TOP_PX = RAIL_TOP_PX + RAIL_HEIGHT_PX;
const TICK_STROKE_HEIGHT_PX = 6;
const TICK_LABEL_TOP_PX = 98;
const BRACKET_CONNECTOR_TOP_PX = 122;
const BRACKET_LABEL_TOP_PX = 128;
const MARKER_LABEL_TOP_PX = 24;

const DEFAULT_RAIL_WIDTH_PX = 460;
const MARKER_LABEL_WIDTH_PX = 112;
const BRACKET_LABEL_WIDTH_PX = 128;
const BRACKET_MIN_SEPARATION_PCT = 2;

function formatTickLabel(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`;
  }
  return String(Math.round(value));
}

function useRailWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_RAIL_WIDTH_PX);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () =>
      setWidth(el.getBoundingClientRect().width || DEFAULT_RAIL_WIDTH_PX);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function MarkerLabel({
  label,
  value,
  leftPx,
}: {
  label: string;
  value: string;
  leftPx: number;
}) {
  return (
    <div
      className="absolute flex w-28 -translate-x-1/2 flex-col items-center gap-0.5 text-center"
      style={{ left: leftPx, top: MARKER_LABEL_TOP_PX }}
    >
      <span className="text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary">
        {label}
      </span>
      <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-primary">
        {value}
      </span>
    </div>
  );
}

export function RiskPriceRail({
  state,
  currentPriceUsd,
  liquidationPriceUsd,
  currentPriceText,
  liquidationPriceText,
  pctToLiquidationText,
}: RiskPriceRailProps) {
  const { ref, width } = useRailWidth();
  const layout = computeRailLayout(currentPriceUsd, liquidationPriceUsd);
  const { lo, hi, ticks, currentPct, liquidationPct, gradient } = layout;

  const isNeutral = currentPct === null;
  const isSolidGreen =
    !isNeutral && (state === "verySafe" || state === "noPosition");
  const showGradient = !isNeutral && !isSolidGreen && liquidationPct !== null;
  const showLiquidationMarker = showGradient;
  const showBracket =
    showGradient &&
    liquidationPct !== null &&
    currentPct !== null &&
    Math.abs(currentPct - liquidationPct) >= BRACKET_MIN_SEPARATION_PCT;

  const currentRingCss =
    state === "liquidatable"
      ? "rgb(var(--risk-red))"
      : "rgb(var(--risk-green))";

  const markerHalf = MARKER_LABEL_WIDTH_PX / 2;
  const labelCenters =
    currentPct !== null && liquidationPct !== null
      ? spreadLabelCenters(
          currentPct,
          liquidationPct,
          width,
          MARKER_LABEL_WIDTH_PX,
        )
      : null;
  const currentLabelPx =
    currentPct === null
      ? null
      : labelCenters
        ? labelCenters.current
        : Math.min(
            width - markerHalf,
            Math.max(markerHalf, (currentPct / 100) * width),
          );

  const railStyle = showGradient
    ? { top: RAIL_TOP_PX, backgroundImage: gradient ?? undefined }
    : { top: RAIL_TOP_PX };
  const railClass = isNeutral
    ? "bg-secondary-strokeLight"
    : showGradient
      ? ""
      : "bg-risk-green";

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`${COPY.risk.chart.currentPriceLabel} ${currentPriceText}, ${COPY.risk.chart.liquidationPriceLabel} ${liquidationPriceText}`}
      className="relative isolate h-[188px] w-full"
    >
      <span className="absolute right-0 top-0 text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
        {COPY.risk.chart.pairLabel}
      </span>

      <div
        className={`absolute left-0 right-0 h-1 rounded-full ${railClass}`}
        style={railStyle}
      />

      {!isNeutral &&
        ticks.map((tick) => {
          const tickPct = ((tick - lo) / (hi - lo)) * 100;
          return (
            <div key={tick}>
              <div
                className="absolute w-px -translate-x-1/2 bg-secondary-strokeLight"
                style={{
                  left: `${tickPct}%`,
                  top: TICK_STROKE_TOP_PX,
                  height: TICK_STROKE_HEIGHT_PX,
                }}
              />
              <span
                className="absolute -translate-x-1/2 text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary"
                style={{ left: `${tickPct}%`, top: TICK_LABEL_TOP_PX }}
              >
                {formatTickLabel(tick)}
              </span>
            </div>
          );
        })}

      {currentLabelPx !== null && (
        <MarkerLabel
          label={COPY.risk.chart.currentPriceLabel}
          value={currentPriceText}
          leftPx={currentLabelPx}
        />
      )}
      {showLiquidationMarker && labelCenters && (
        <MarkerLabel
          label={COPY.risk.chart.liquidationPriceLabel}
          value={liquidationPriceText}
          leftPx={labelCenters.liquidation}
        />
      )}

      {currentPct !== null && (
        <div
          data-testid="risk-marker-current"
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
          style={{
            left: `${currentPct}%`,
            top: RAIL_CENTER_PX,
            border: `3px solid ${currentRingCss}`,
          }}
        />
      )}
      {showLiquidationMarker && liquidationPct !== null && (
        <div
          data-testid="risk-marker-liquidation"
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
          style={{
            left: `${liquidationPct}%`,
            top: RAIL_CENTER_PX,
            border: "3px solid rgb(var(--risk-red))",
          }}
        />
      )}

      {showBracket && liquidationPct !== null && currentPct !== null && (
        <RiskBracket
          leftPct={Math.min(currentPct, liquidationPct)}
          rightPct={Math.max(currentPct, liquidationPct)}
          widthPx={width}
          pctToLiquidationText={pctToLiquidationText}
        />
      )}
    </div>
  );
}

function RiskBracket({
  leftPct,
  rightPct,
  widthPx,
  pctToLiquidationText,
}: {
  leftPct: number;
  rightPct: number;
  widthPx: number;
  pctToLiquidationText: string;
}) {
  const stemHeight = BRACKET_CONNECTOR_TOP_PX - RAIL_CENTER_PX;
  const bracketHalf = BRACKET_LABEL_WIDTH_PX / 2;
  const centerPx = Math.min(
    widthPx - bracketHalf,
    Math.max(bracketHalf, ((leftPct + rightPct) / 2 / 100) * widthPx),
  );
  return (
    <>
      <div
        className="absolute border-l border-dashed border-secondary-strokeLight"
        style={{ left: `${leftPct}%`, top: RAIL_CENTER_PX, height: stemHeight }}
      />
      <div
        className="absolute border-l border-dashed border-secondary-strokeLight"
        style={{
          left: `${rightPct}%`,
          top: RAIL_CENTER_PX,
          height: stemHeight,
        }}
      />
      <div
        className="absolute border-t border-dashed border-secondary-strokeLight"
        style={{
          left: `${leftPct}%`,
          width: `${rightPct - leftPct}%`,
          top: BRACKET_CONNECTOR_TOP_PX,
        }}
      />
      <div
        className="absolute flex w-32 -translate-x-1/2 flex-col items-center gap-0.5 text-center"
        style={{ left: centerPx, top: BRACKET_LABEL_TOP_PX }}
      >
        <span className="text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary">
          {COPY.overview.pctToLiquidationLabel}
        </span>
        <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-primary">
          {pctToLiquidationText}
        </span>
      </div>
    </>
  );
}
