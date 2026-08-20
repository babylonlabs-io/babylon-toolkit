import { Container, Loader, Timeline } from "@babylonlabs-io/core-ui";
import { useDeferredValue, useMemo, useState } from "react";
import { useOutletContext } from "react-router";

import { BPS_SCALE } from "@/applications/aave/constants";
import { useBtcPriceCandles } from "@/applications/aave/hooks/useBtcPriceCandles";
import { calculate } from "@/applications/aave/positionNotifications";
import type { RootLayoutContext } from "@/components/pages/RootLayout";
import { EmptyState } from "@/components/shared";
import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import { useConnection, useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useLoanActions } from "@/hooks/useLoanActions";
import { formatPriceUsd } from "@/utils/formatting";

import {
  axisFloorPrice,
  buildLiquidationChartData,
  buildTimelinePriceAxis,
  buildTimelineSafeZone,
  formatCandleDate,
  withAmountInBandLabel,
} from "./liquidationChartData";
import { LiquidationEventCard } from "./LiquidationEventCard";
import { PositionOverview } from "./PositionOverview";
import { SimulationToolbar } from "./SimulationToolbar";
import { useLiquidationsPageState } from "./useLiquidationsPageState";

/**
 * Liquidation Dashboard (issue #2043, Figma node 10209:67763).
 *
 * Live data: the cascade comes from `usePositionNotifications()`, the same
 * calculator the position-notification banners use. The chart is core-ui's
 * visx `Timeline` — BTC/USD candles from the indexer's oracle price history
 * behind the liquidation bands; the simulator and event cards around it are
 * live.
 *
 * God mode (dev only): when the debug panel's manual mode has produced a
 * cascade, this page charts THAT cascade instead — and every position stat
 * derives from it too, never from the live `useDashboardState`, so a
 * fabricated demo can never be shown as if it were the depositor's real
 * position. See `src/overrides/position.ts`. A separate position override
 * (`src/overrides/liquidations.ts`) can additionally force the stat cards'
 * own figures independent of the cascade — it wins over both the live
 * position and the cascade for those cards, while the cascade keeps driving
 * the event cards.
 */

/**
 * The simulator only ever looks downward, so a live price that falls past a
 * held simulation re-clamps to it rather than leaving the thumb above market.
 */
function clampToLive(simulated: number | null, live: number): number {
  return simulated === null ? live : Math.min(simulated, live);
}

/** Daily candles in view at rest; the rest of the series is reachable by pan. */
const TIMELINE_VISIBLE_CANDLES = 60;

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
        {label}
      </span>
      <span className="text-xl leading-[1.6] tracking-[0.15px] text-accent-primary">
        {value}
      </span>
    </span>
  );
}

export default function Liquidations() {
  const { openDeposit } = useOutletContext<RootLayoutContext>();
  const { address } = useETHWallet();
  const { isConnected } = useConnection();
  const account = isConnected ? address : undefined;

  const {
    hasCollateral,
    hasLoans,
    collateralFactorBps,
    isLoading,
    borrowedAssets,
  } = useDashboardState(account);

  const { openBorrowPicker, openRepay } = useLoanActions({ borrowedAssets });

  const {
    position,
    params,
    result,
    isGodMode,
    cascade: cascadeOverride,
  } = useLiquidationsPageState(account);

  const { candles } = useBtcPriceCandles();

  const livePrice = params?.btcPrice ?? null;
  // `null` = "track the live price" — the slider hasn't diverged from it (or
  // hasn't synced yet).
  const [simulatedPrice, setSimulatedPrice] = useState<number | null>(null);

  // Clamped to the live price rather than reset by it. `usePrices` refetches
  // every 60s (15s when unhealthy) and BTC moves on essentially every poll, so
  // resetting here would discard the depositor's what-if about once a minute
  // mid-analysis. The simulator only looks downward, so a live price that
  // falls past a held simulation re-clamps instead; the `isSimulating` chip is
  // what stops a simulated price from ever reading as live.
  const currentPrice =
    livePrice === null ? null : clampToLive(simulatedPrice, livePrice);

  // `calculate()` runs an O(3^n) bitmask DP over the vault set (~56ms at 16
  // vaults, ~158ms at 17), and dragging the slider across a $30k range at
  // $100 steps would otherwise fire it ~300 times synchronously. Deferring
  // only the price the CASCADE reads keeps the drag responsive: the toolbar
  // below still tracks `currentPrice` directly, so the thumb never lags, and
  // React discards the intermediate cascades it never finishes rendering.
  const projectedPrice = useDeferredValue(currentPrice);

  // The what-if path: re-run the pure calculator with the simulated price
  // instead of touching `result`, the live value `usePositionNotifications`
  // computed for every other consumer (e.g. the position-notification banners).
  const cascadeResult = useMemo(() => {
    if (!params || projectedPrice === null) return null;
    if (projectedPrice === params.btcPrice) return result;
    return calculate({ ...params, btcPrice: projectedPrice });
  }, [params, result, projectedPrice]);

  const collateralFactor = cascadeOverride
    ? cascadeOverride.params.CF
    : collateralFactorBps !== null
      ? collateralFactorBps / BPS_SCALE
      : null;

  // The chart's own inputs, bundled atomically so a price and its cascade can
  // never be paired with each other's stale sibling. `null` = nothing to
  // chart yet — a real position must never be charted from stand-in numbers.
  const chart = useMemo(() => {
    if (!result || !cascadeResult || cascadeResult.groups.length === 0) {
      return null;
    }
    if (collateralFactor === null || livePrice === null) return null;
    if (projectedPrice === null || !params) return null;

    // Built from `projectedPrice`, the same price `cascadeResult` was
    // calculated at, so the bands and the price line can never disagree
    // while the deferred cascade is catching up with the thumb.
    const data = buildLiquidationChartData(cascadeResult, {
      btcPrice: projectedPrice,
      collateralFactor,
      livePrice,
      vaultsTotal: params.vaults.length,
    });

    // The axis top has to clear the candles as well as the price rule —
    // anything above the first tick is clipped out of the plot.
    const topPrice = (candles ?? []).reduce(
      (max, candle) => Math.max(max, candle.high),
      livePrice,
    );

    return {
      ...data,
      bands: withAmountInBandLabel(data.bands),
      // Axis and safe zone read the LIVE cascade, like `floorPrice` below: the
      // trigger prices are properties of the position, so the frame stays put
      // while the simulator drags the rule through it.
      timelinePriceAxis: buildTimelinePriceAxis(result, topPrice),
      safeZone: buildTimelineSafeZone(result, projectedPrice),
      projectedPrice,
      livePrice,
      floorPrice: axisFloorPrice(result),
    };
  }, [
    result,
    cascadeResult,
    collateralFactor,
    livePrice,
    projectedPrice,
    params,
    candles,
  ]);

  if (!isGodMode && !isConnected) {
    return (
      <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
        <EmptyState
          title={COPY.liquidations.emptyDisconnected}
          isConnected={false}
          withCard
        />
      </Container>
    );
  }

  if (!isGodMode && isLoading) {
    return (
      <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
        <div className="flex items-center justify-center py-12">
          <Loader />
        </div>
      </Container>
    );
  }

  if (!isGodMode && !hasCollateral) {
    return (
      <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
        <EmptyState
          title={COPY.liquidations.empty.noDepositTitle}
          description={COPY.liquidations.empty.noDepositDescription}
          isConnected
          actionLabel={COPY.liquidations.position.deposit}
          onAction={() => openDeposit()}
          withCard
        />
      </Container>
    );
  }

  const borrowedRatio =
    position.maxTotalDebtUsd > 0
      ? position.debtValueUsd / position.maxTotalDebtUsd
      : 0;

  const positionOverview = (
    <PositionOverview
      collateralBtc={position.collateralBtc}
      collateralValueUsd={position.collateralValueUsd}
      debtUsd={position.debtValueUsd}
      borrowedRatio={borrowedRatio}
      healthFactor={position.healthFactor}
      healthFactorStatus={position.healthFactorStatus}
      onDeposit={() => openDeposit()}
      onRepay={openRepay}
    />
  );

  if (!isGodMode && !hasLoans) {
    return (
      <Container
        className={`${PAGE_CONTENT_CLASS} flex flex-1 flex-col gap-10 pb-6`}
      >
        <section className="flex flex-col gap-4">
          <h2 className="text-xl leading-[1.6] tracking-[0.15px] text-accent-primary">
            {COPY.liquidations.position.heading}
          </h2>
          {positionOverview}
        </section>
        <EmptyState
          title={COPY.liquidations.empty.noLoanTitle}
          description={COPY.liquidations.empty.noLoanDescription}
          isConnected
          actionLabel={COPY.liquidations.empty.borrow}
          onAction={openBorrowPicker}
          withCard
        />
      </Container>
    );
  }

  // A real position with no cascade to chart. Reachable with `isLoading`
  // false: `usePositionNotifications` returns `params: null` on `stale-price`
  // and `no-price`, so a depositor with a stale oracle lands here. Rendering
  // the position and nothing else leaves the page that exists FOR the analysis
  // silently half-blank, with no message and no loader.
  if (!chart) {
    return (
      <Container
        className={`${PAGE_CONTENT_CLASS} flex flex-1 flex-col gap-10 pb-6`}
      >
        <section className="flex flex-col gap-4">
          <h2 className="text-xl leading-[1.6] tracking-[0.15px] text-accent-primary">
            {COPY.liquidations.position.heading}
          </h2>
          {positionOverview}
        </section>
        <EmptyState
          title={COPY.liquidations.empty.unavailableTitle}
          description={COPY.liquidations.empty.unavailableDescription}
          isConnected
          withCard
        />
      </Container>
    );
  }

  // The immediate price, not the deferred one: the chip and Reset must respond
  // on the first drag step rather than trailing the cascade.
  const isSimulating =
    clampToLive(simulatedPrice, chart.livePrice) !== chart.livePrice;

  return (
    <Container
      as="main"
      className={`${PAGE_CONTENT_CLASS} flex flex-1 flex-col gap-10 pb-6`}
    >
      <section className="flex flex-col gap-4">
        <h2 className="text-xl leading-[1.6] tracking-[0.15px] text-accent-primary">
          {COPY.liquidations.position.heading}
        </h2>
        {positionOverview}
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl leading-[1.6] tracking-[0.15px] text-accent-primary">
              {COPY.liquidations.heading}
            </h2>
            <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
              {COPY.liquidations.vaultsLiquidated(
                chart.summary.vaultsLiquidated,
                chart.summary.vaultsTotal,
              )}
            </span>
            {isSimulating && (
              <span className="rounded-full bg-risk-amber px-2.5 py-1 text-xs leading-[1.4] tracking-[0.4px] text-primary-main">
                {COPY.liquidations.simulationChip}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <SummaryStat
              label={COPY.liquidations.seizedSummaryLabel}
              value={`${chart.summary.seizedPct}%`}
            />
            <span className="h-8 w-px bg-secondary-strokeLight" />
            <SummaryStat
              label={COPY.liquidations.collateralSummaryLabel}
              value={chart.summary.collateralRemainingLabel}
            />
          </div>
        </div>

        <div className="flex flex-col gap-6 rounded-lg bg-background-secondary p-6">
          <SimulationToolbar
            livePrice={chart.livePrice}
            floorPrice={chart.floorPrice}
            price={clampToLive(simulatedPrice, chart.livePrice)}
            onPriceChange={setSimulatedPrice}
          />
          <Timeline
            bands={chart.bands}
            candles={candles ?? []}
            currentPrice={chart.projectedPrice}
            currentPriceLabel={formatPriceUsd(chart.projectedPrice)}
            priceAxis={chart.timelinePriceAxis}
            safeZone={chart.safeZone}
            visibleCandles={TIMELINE_VISIBLE_CANDLES}
            interactions={{ crosshair: true, pan: true }}
            formatPrice={formatPriceUsd}
            formatTime={formatCandleDate}
            liquidatedLabel={COPY.liquidations.liquidatedBandLabel}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col">
          <h2 className="text-xl leading-[1.6] tracking-[0.15px] text-accent-primary">
            {COPY.liquidations.events.heading}
          </h2>
          <p className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
            {COPY.liquidations.events.subheading}
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {chart.cards.map((card) => (
            <div key={card.key}>
              <LiquidationEventCard card={card} />
            </div>
          ))}
        </div>
      </section>
    </Container>
  );
}
