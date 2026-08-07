import { Container, Loader, SeizureMap } from "@babylonlabs-io/core-ui";
import { useDeferredValue, useMemo, useState } from "react";
import { useOutletContext } from "react-router";

import {
  BPS_SCALE,
  MIN_HEALTH_FACTOR_FOR_BORROW,
} from "@/applications/aave/constants";
import { usePositionNotifications } from "@/applications/aave/hooks/usePositionNotifications";
import { calculate } from "@/applications/aave/positionNotifications";
import {
  calculateBorrowCapacityUsd,
  getHealthFactorStatusFromValue,
} from "@/applications/aave/utils";
import type { RootLayoutContext } from "@/components/pages/RootLayout";
import { EmptyState } from "@/components/shared";
import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import { useConnection, useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import {
  useDebugManualMode,
  useDebugManualParams,
  useDebugPositionOverride,
} from "@/dev/debugPositionStore";
import { useLiquidationPositionOverride } from "@/dev/liquidationDebugStore";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useLoanActions } from "@/hooks/useLoanActions";
import { formatPriceUsd } from "@/utils/formatting";

import {
  axisFloorPrice,
  buildLiquidationChartData,
} from "./liquidationChartData";
import { LiquidationEventCard } from "./LiquidationEventCard";
import { PositionOverview } from "./PositionOverview";
import { SimulationToolbar } from "./SimulationToolbar";

/**
 * Liquidation Dashboard (issue #2043, Figma node 10209:67763).
 *
 * Live data: the cascade comes from `usePositionNotifications()`, the same
 * calculator the position-notification banners use. The chart is core-ui's
 * visx `SeizureMap` (#2160); the simulator and event cards around it are live.
 *
 * God mode (dev only): when the debug panel's manual mode has produced a
 * cascade, this page charts THAT cascade instead — and every position stat
 * derives from it too, never from the live `useDashboardState`, so a
 * fabricated demo can never be shown as if it were the depositor's real
 * position. See `src/dev/debugPositionStore.ts`. A separate position override
 * (`src/dev/liquidationDebugStore.ts`) can additionally force the stat cards'
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

  const { result: liveResult, params: liveParams } =
    usePositionNotifications(account);
  const {
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    maxTotalDebtUsd,
    healthFactor,
    healthFactorStatus,
    hasCollateral,
    hasLoans,
    collateralFactorBps,
    isLoading,
    borrowedAssets,
  } = useDashboardState(account);

  const { openBorrowPicker, openRepay } = useLoanActions({ borrowedAssets });

  // God-mode override (dev only): manual mode drives this page's whole
  // cascade, bypassing the connection/empty-state ladder below, the way
  // `DashboardPage.tsx` drives its overview card. Compile-time dead in
  // production, like the other debug hooks (debugPositionStore.ts) — nothing
  // ever sets `manualMode` outside the debug panel, which is only imported
  // behind `import.meta.env.DEV`.
  const debugManualMode = useDebugManualMode();
  const { result: debugResultOverride } = useDebugPositionOverride();
  const debugManualParams = useDebugManualParams();
  const godMode = useMemo(
    () =>
      debugManualMode && debugResultOverride
        ? { result: debugResultOverride, params: debugManualParams }
        : null,
    [debugManualMode, debugResultOverride, debugManualParams],
  );

  // Position override (dev only): a lighter-weight god-mode control that sets
  // this page's stat cards directly, without needing a real position or a
  // Manual Mode cascade. It wins for the stat cards even over an active
  // cascade above — see the `position` derivation below — while the cascade
  // (godMode/`result`) keeps driving the event cards untouched.
  const positionOverride = useLiquidationPositionOverride();
  const isGodMode = godMode !== null || positionOverride !== null;

  const result = godMode?.result ?? liveResult;
  const params = godMode?.params ?? liveParams;

  // Position stats shown above the chart. Precedence: the position override,
  // then the god-mode cascade's own numbers, then the live `useDashboardState`
  // figures — a mocked stat must never render mixed with a real one, so each
  // branch is self-contained rather than layering overrides on a live base.
  const position = useMemo(() => {
    if (positionOverride) {
      const {
        collateralBtc: overrideCollateralBtc,
        debtUsd,
        healthFactor: overrideHealthFactor,
      } = positionOverride;
      // Price: the active cascade's if Manual Mode is on, else the live oracle
      // price — `params` already resolves that precedence. No price available
      // = an absent caption, not a fabricated "$0.00 USD".
      // `maxTotalDebtUsd = debtUsd * HF / MIN_HEALTH_FACTOR_FOR_BORROW` mirrors
      // `calculateBorrowCapacityUsd`: live HF = collateralValueUsd * LT /
      // (BPS_SCALE * debtUsd), and maxTotalDebtUsd = collateralValueUsd * LT /
      // BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW, so substituting collapses to
      // this — guarded so a non-positive HF can't divide by zero or produce a
      // negative denominator.
      const btcPrice = params?.btcPrice ?? null;
      return {
        collateralBtc: overrideCollateralBtc,
        collateralValueUsd:
          btcPrice !== null ? overrideCollateralBtc * btcPrice : null,
        debtValueUsd: debtUsd,
        maxTotalDebtUsd:
          overrideHealthFactor > 0
            ? (debtUsd * overrideHealthFactor) / MIN_HEALTH_FACTOR_FOR_BORROW
            : 0,
        healthFactor: overrideHealthFactor,
        healthFactorStatus:
          getHealthFactorStatusFromValue(overrideHealthFactor),
      };
    }
    if (!godMode) {
      return {
        collateralBtc,
        collateralValueUsd,
        debtValueUsd,
        maxTotalDebtUsd,
        healthFactor,
        healthFactorStatus,
      };
    }
    const { result: gmResult, params: gmParams } = godMode;
    const { maxTotalDebtUsd: gmMaxTotalDebtUsd } = calculateBorrowCapacityUsd({
      collateralValueUsd: gmResult.collateralValue,
      currentDebtUsd: gmParams.totalDebtUsd,
      liquidationThresholdBps: Math.round(gmParams.CF * BPS_SCALE),
    });
    return {
      collateralBtc: gmParams.vaults.reduce((sum, v) => sum + v.btc, 0),
      collateralValueUsd: gmResult.collateralValue,
      debtValueUsd: gmParams.totalDebtUsd,
      maxTotalDebtUsd: gmMaxTotalDebtUsd,
      healthFactor: gmResult.currentHF,
      healthFactorStatus: getHealthFactorStatusFromValue(gmResult.currentHF),
    };
  }, [
    positionOverride,
    params,
    godMode,
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    maxTotalDebtUsd,
    healthFactor,
    healthFactorStatus,
  ]);

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

  const collateralFactor = godMode
    ? godMode.params.CF
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

    return {
      // Built from `projectedPrice`, the same price `cascadeResult` was
      // calculated at, so the bands and the price line can never disagree
      // while the deferred cascade is catching up with the thumb.
      ...buildLiquidationChartData(cascadeResult, {
        btcPrice: projectedPrice,
        collateralFactor,
        livePrice,
        vaultsTotal: params.vaults.length,
      }),
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
          <SeizureMap
            bands={chart.bands}
            currentPrice={chart.projectedPrice}
            currentPriceLabel={formatPriceUsd(chart.projectedPrice)}
            priceLineCaption={COPY.liquidations.bitcoinPriceCaption}
            priceAxis={chart.priceAxis}
            shareAxisTicks={chart.shareAxisTicks}
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
