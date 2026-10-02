/**
 * Liquidation preview inside the borrow flow (issue #2318, Figma node
 * 13885:97130).
 *
 * Charts the cascade the entered borrow amount WOULD produce: the same pure
 * `calculate()` the position notifications run, re-run against the projected
 * debt, so raising the amount visibly closes the gap between the oracle price
 * and the liquidation events. Nothing here is fabricated — with no position,
 * no price, or no cascade to chart, the card renders nothing rather than a
 * stand-in.
 */

import {
  Accordion,
  AccordionDetails,
  LiquidationsIcon,
  Loader,
  SubSection,
  Timeline,
  timelineMinPlotHeight,
} from "@babylonlabs-io/core-ui";
import { useDeferredValue, useMemo, useState } from "react";

import {
  TIMELINE_VISIBLE_CANDLES,
  useBtcPriceCandles,
} from "@/applications/aave/hooks/useBtcPriceCandles";
import { usePositionNotifications } from "@/applications/aave/hooks/usePositionNotifications";
import { calculate } from "@/applications/aave/positionNotifications";
import { toWeeklyCandles } from "@/applications/aave/services/weeklyCandles";
import {
  buildLiquidationChartData,
  buildTimelinePriceAxis,
  formatCandleMonth,
  withVaultAmountsInBandLabel,
} from "@/components/pages/Liquidations/liquidationChartData";
// Imported from its own module, not the `@/components/shared` barrel, which
// drags the whole deposit surface in behind one button.
import { ExpandMenuButton } from "@/components/shared/ExpandMenuButton";
import { CHART_LOADING_BOX_CLASS } from "@/components/shared/layoutClasses";
import { useConnection, useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { usePositionCascadeOverride } from "@/overrides/position";
import { formatBtcAmount, formatCompactPrice } from "@/utils/formatting";

/** Figma 13885:97130 gridline length; the 538px frame includes the y-axis
 *  labels. */
const PLOT_WIDTH_PX = 512;
const CHART_HEIGHT_PX = 240;

/**
 * Event-row height. The design draws 23.6px bands; this rounds up to clear the
 * label's line box — the band font scales with the chart, topping out at 14px
 * (a ~17px line), and 8px of vertical padding comes off the row before the
 * text. A row on the exact boundary would let a fraction of a pixel decide
 * whether an event is named. Passing it makes the Timeline hold every row at
 * this height at any chart width, growing the plot for a long cascade. The
 * dashboard's taller chart keeps the component's own 44px default.
 */
const EVENT_ROW_PX = 26;

interface LiquidationPreviewProps {
  /**
   * USD the entered borrow amount would add to the position's debt; 0 charts
   * the position as it stands.
   *
   * `null` means the amount's debt is UNKNOWN — no oracle price, or one that
   * still belongs to the previously-selected reserve. The card then renders
   * nothing: a chart headed "Liquidation preview" that quietly falls back to
   * the current position would understate the risk being taken on.
   */
  additionalDebtUsd: number | null;
}

/** One legend swatch: a rule in the mark's own colour, then its name. */
function LegendItem({
  color,
  dashed,
  label,
}: {
  color: string;
  dashed: boolean;
  label: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`h-0 w-8 shrink-0 border-t-2 ${dashed ? "border-dashed" : "border-solid"}`}
        style={{ borderTopColor: color }}
      />
      {label}
    </span>
  );
}

export function LiquidationPreview({
  additionalDebtUsd,
}: LiquidationPreviewProps) {
  const [expanded, setExpanded] = useState(true);
  const { address } = useETHWallet();
  const { isConnected } = useConnection();
  const live = usePositionNotifications(isConnected ? address : undefined);
  // God-mode cascade when the panel publishes one, else the live position. A
  // status-only override carries no cascade and falls through to live.
  const cascadeOverride = usePositionCascadeOverride();
  const { params, result } = cascadeOverride?.result
    ? { params: cascadeOverride.params, result: cascadeOverride.result }
    : live;
  const { candles, isLoading: isLoadingCandles } = useBtcPriceCandles();

  // `calculate()` is an O(3^n) bitmask DP over the vault set and the borrow
  // slider steps a thousand times across its range, so the cascade reads a
  // deferred debt: the metrics card above still tracks the entered amount
  // directly, and React drops the intermediate cascades it never finishes.
  // Same treatment the /liquidations price simulator gives its slider.
  // The null is deferred with the number, and the card withdraws while EITHER
  // side is unknown: deferring only the number would chart the position
  // without the amount for a commit after the debt becomes known.
  const deferredDebtUsd = useDeferredValue(additionalDebtUsd);

  // A year of daily candles is under 1.5px per slot in this modal; the design
  // charts ~52 weekly bars over the same window. The fetch carries extra pan
  // history for /liquidations; this chart is locked to the latest year.
  const weeklyCandles = useMemo(
    () => toWeeklyCandles((candles ?? []).slice(-TIMELINE_VISIBLE_CANDLES)),
    [candles],
  );

  const projected = useMemo(() => {
    if (!params || deferredDebtUsd === null) return null;
    return calculate({
      ...params,
      totalDebtUsd: params.totalDebtUsd + deferredDebtUsd,
    });
  }, [params, deferredDebtUsd]);

  /**
   * The axis top and step come from the LIVE cascade, never the projected
   * one, so the ruler holds still while the amount changes. Deriving them
   * from the projection re-rounds the axis top as the first trigger rises (a
   * $70k trigger rounds the top to $100k, a $75k one to $95k), which can
   * WIDEN the drawn gap on a position that just got riskier. With the top
   * pinned to the live position, the gap falls monotonically as debt rises.
   * The floor and the labelled-tick cut-off follow the projection, so a
   * projected trigger below the live floor keeps its band and no round tick
   * lands inside the projected event rows.
   *
   * The axis top also has to clear the candles, not just the price rule —
   * anything above the first tick is clipped out of the plot.
   */
  const priceAxis = useMemo(() => {
    if (!params || !result || !projected) return null;
    const topPrice = weeklyCandles.reduce(
      (max, candle) => Math.max(max, candle.high),
      params.btcPrice,
    );
    return buildTimelinePriceAxis(result, topPrice, {
      formatLabel: formatCompactPrice,
      projected,
    });
  }, [params, result, projected, weeklyCandles]);

  const bands = useMemo(() => {
    if (!params || !projected) return null;
    // Invalid governance params leave `groups` empty with debt still present,
    // which charts as zero bands — the same guard the overview preview applies.
    if (projected.groups.length === 0) return null;

    const chart = buildLiquidationChartData(projected, {
      btcPrice: params.btcPrice,
      collateralFactor: params.CF,
      vaultsTotal: params.vaults.length,
    });
    return withVaultAmountsInBandLabel(chart.bands, projected.groups);
  }, [params, projected]);

  if (
    additionalDebtUsd === null ||
    deferredDebtUsd === null ||
    !params ||
    !bands ||
    !priceAxis
  ) {
    return null;
  }

  const collateralBtc = params.vaults.reduce(
    (sum, vault) => sum + vault.btc,
    0,
  );

  return (
    <SubSection className="flex-col !bg-secondary-highlight !py-4">
      <Accordion expanded={expanded} fluid>
        <div className="flex w-full items-center justify-between">
          <span className="flex items-center gap-2 text-accent-primary">
            <LiquidationsIcon />
            {COPY.liquidations.preview.title}
          </span>
          <ExpandMenuButton
            isExpanded={expanded}
            onToggle={() => setExpanded((previous) => !previous)}
            aria-label={COPY.liquidations.preview.title}
          />
        </div>

        {/* AccordionDetails carries the shared dropdown motion and owns the
            collapsed visibility. */}
        <AccordionDetails className="flex flex-col gap-4">
          {/* The gap above the divider lives inside the measured content, so
              a collapsed card leaves none. */}
          <div
            aria-hidden="true"
            className="mt-4 h-px w-full bg-secondary-strokeLight"
          />
          <div className="flex w-full items-center justify-between text-base">
            <span className="text-accent-secondary">
              {COPY.liquidations.preview.totalCollateralLabel}
            </span>
            <span className="text-accent-primary">
              {COPY.liquidations.preview.totalCollateralValue(
                formatBtcAmount(collateralBtc),
                params.vaults.length,
              )}
            </span>
          </div>

          {isLoadingCandles ? (
            // The chart's own ratio and plot-height floor, not the shared
            // box's ratio, so the card keeps its height when the candles land.
            <div
              className={`${CHART_LOADING_BOX_CLASS} mt-2`}
              style={{
                aspectRatio: `${PLOT_WIDTH_PX} / ${CHART_HEIGHT_PX}`,
                minHeight: timelineMinPlotHeight(bands.length, EVENT_ROW_PX),
              }}
            >
              <Loader />
            </div>
          ) : (
            <Timeline
              bands={bands}
              candles={weeklyCandles}
              currentPrice={params.btcPrice}
              currentPriceLabel={formatCompactPrice(params.btcPrice)}
              priceAxis={priceAxis}
              bandPlacement="plot"
              seriesStyle="candles+line"
              aspectRatio={PLOT_WIDTH_PX / CHART_HEIGHT_PX}
              eventRowPx={EVENT_ROW_PX}
              formatPrice={formatCompactPrice}
              priceLineColor="var(--liq-price-line-accent)"
              grid={{ lines: "both", style: "solid" }}
              className="mt-2"
              formatTime={formatCandleMonth}
              liquidatedLabel={COPY.liquidations.liquidatedBandLabel}
            />
          )}

          <div className="flex items-center gap-6 text-xs text-accent-primary">
            <LegendItem
              color="var(--liq-price-line-accent)"
              dashed={false}
              label={COPY.liquidations.preview.legendPrice}
            />
            <LegendItem
              color="var(--liq-band-1)"
              dashed
              label={COPY.liquidations.preview.legendLiquidation}
            />
          </div>
        </AccordionDetails>
      </Accordion>
    </SubSection>
  );
}
