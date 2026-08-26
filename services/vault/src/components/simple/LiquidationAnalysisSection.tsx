import { Heading, Timeline } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import { useNavigate } from "react-router";

import { useBtcPriceCandles } from "@/applications/aave/hooks/useBtcPriceCandles";
import type {
  CalculatorParams,
  CalculatorResult,
} from "@/applications/aave/positionNotifications/types";
import {
  buildLiquidationChartData,
  buildTimelinePriceAxis,
  buildTimelineSafeZone,
  formatCandleDate,
} from "@/components/pages/Liquidations/liquidationChartData";
import {
  NEUTRAL_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "@/components/shared/buttonClasses";
import { COPY } from "@/copy";
import { ROUTES } from "@/routes";
import { formatPriceUsd } from "@/utils/formatting";

/** The cascade the chart renders. Absent = nothing to chart yet.
 *
 *  Carries the params `result` was computed from, not values derived from
 *  them: the price simulator has to re-run `calculate()` at the simulated
 *  price, and `params.vaults` is the only source for the "x/y vaults" count
 *  (`calculate()` stops emitting groups once the debt clears, so a vault it
 *  never consumed has no group). */
export interface LiquidationCascade {
  result: CalculatorResult;
  params: CalculatorParams;
}

interface LiquidationAnalysisSectionProps {
  hasCollateral: boolean;
  hasLoans: boolean;
  onDeposit: () => void;
  onBorrow: () => void;
  /**
   * Required to render the chart — there is deliberately no placeholder
   * fallback here, so a position can never be charted from made-up numbers.
   */
  cascade?: LiquidationCascade | null;
}

/** Daily candles in view. The preview does not pan; Explore opens the page. */
const TIMELINE_VISIBLE_CANDLES = 60;

/**
 * Overview-page preview of the Liquidation Dashboard: no collateral,
 * collateral without a loan, or the price timeline at the live BTC price.
 * The simulator itself lives on the dashboard page behind Explore.
 */

/** A centred title/description/action block. */
function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex min-h-[312px] flex-col items-center justify-center gap-1 text-center">
      <p className="text-xl leading-[1.6] tracking-[0.15px] text-accent-primary">
        {title}
      </p>
      <p className="max-w-[600px] text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
        {description}
      </p>
      {/* Wrapped: passing by reference hands `openDeposit` the click event. */}
      <button
        type="button"
        onClick={() => onAction()}
        className={`mt-6 ${PRIMARY_BUTTON_CLASS}`}
      >
        {actionLabel}
      </button>
    </div>
  );
}

function LiquidationChartPanel({
  cascade,
  onExplore,
}: {
  cascade: LiquidationCascade;
  onExplore: () => void;
}) {
  const { candles } = useBtcPriceCandles();

  const chart = useMemo(() => {
    const { bands } = buildLiquidationChartData(cascade.result, {
      btcPrice: cascade.params.btcPrice,
      collateralFactor: cascade.params.CF,
      vaultsTotal: cascade.params.vaults.length,
    });
    // The axis top has to clear the candles as well as the price rule —
    // anything above the first tick is clipped out of the plot.
    const topPrice = (candles ?? []).reduce(
      (max, candle) => Math.max(max, candle.high),
      cascade.params.btcPrice,
    );
    return {
      bands,
      priceAxis: buildTimelinePriceAxis(cascade.result, topPrice),
      safeZone: buildTimelineSafeZone(cascade.result, cascade.params.btcPrice),
    };
  }, [cascade, candles]);

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
            {COPY.liquidations.simulateLabel}
          </span>
          <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
            {COPY.liquidations.simulateDescription}
          </span>
        </div>
        <button
          type="button"
          onClick={onExplore}
          className={NEUTRAL_BUTTON_CLASS}
        >
          {COPY.liquidations.exploreAction}
        </button>
      </div>

      <Timeline
        bands={chart.bands}
        candles={candles ?? []}
        currentPrice={cascade.params.btcPrice}
        currentPriceLabel={formatPriceUsd(cascade.params.btcPrice)}
        priceAxis={chart.priceAxis}
        safeZone={chart.safeZone}
        visibleCandles={TIMELINE_VISIBLE_CANDLES}
        formatPrice={formatPriceUsd}
        formatTime={formatCandleDate}
        liquidatedLabel={COPY.liquidations.liquidatedBandLabel}
      />
    </>
  );
}

export function LiquidationAnalysisSection({
  hasCollateral,
  hasLoans,
  onDeposit,
  onBorrow,
  cascade,
}: LiquidationAnalysisSectionProps) {
  const navigate = useNavigate();

  // Invalid governance params leave `groups` empty with debt still present
  // (calculate.ts skips the prefix walk when `seizedFraction` clamps). Charting
  // that renders zero bands, so treat it as nothing to chart — the same guard
  // the /liquidations page applies.
  const chartable = Boolean(cascade?.result.groups.length);

  let body;
  if (!hasCollateral) {
    body = (
      <EmptyState
        title={COPY.liquidations.empty.noDepositTitle}
        description={COPY.liquidations.empty.noDepositDescription}
        actionLabel={COPY.liquidations.position.deposit}
        onAction={onDeposit}
      />
    );
  } else if (!hasLoans) {
    // The cascade only exists once there is debt to liquidate.
    body = (
      <EmptyState
        title={COPY.liquidations.empty.noLoanTitle}
        description={COPY.liquidations.empty.noLoanDescription}
        actionLabel={COPY.liquidations.empty.borrow}
        onAction={onBorrow}
      />
    );
  } else if (cascade && chartable) {
    body = (
      <LiquidationChartPanel
        cascade={cascade}
        onExplore={() => navigate(ROUTES.LIQUIDATIONS)}
      />
    );
  } else {
    // A real position with no cascade to chart: show nothing rather than an
    // empty frame or a stand-in.
    return null;
  }

  return (
    <div className="space-y-2">
      <Heading variant="h6" as="h2" className="font-normal text-accent-primary">
        {COPY.liquidations.heading}
      </Heading>

      <div className="flex flex-col gap-6 rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-6 dark:bg-[#202020]">
        {body}
      </div>
    </div>
  );
}
