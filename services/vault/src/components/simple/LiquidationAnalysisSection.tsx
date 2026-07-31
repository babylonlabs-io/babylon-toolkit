import { Heading, SeizureMap, Slider } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { twJoin } from "tailwind-merge";

import type { CalculatorResult } from "@/applications/aave/positionNotifications/types";
import { LiquidationEventCards } from "@/components/pages/Liquidations/LiquidationEventCards";
import {
  buildLiquidationChartData,
  buildSimulationSummary,
} from "@/components/pages/Liquidations/liquidationChartData";
import {
  NEUTRAL_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "@/components/shared/buttonClasses";
import { COPY } from "@/copy";
import { ROUTES } from "@/routes";
import { formatPriceUsd } from "@/utils/formatting";

/** The cascade the chart renders. Absent = nothing to chart yet. */
export interface LiquidationCascade {
  result: CalculatorResult;
  btcPrice: number;
  collateralFactor: number;
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

/** Slider granularity for the simulated BTC price. */
const SIM_PRICE_STEP_USD = 100;
/** Matches the chart's `--liq-price-line` orange so slider and rule read as one control. */
const PRICE_SLIDER_COLOR = "#f7931a";

/**
 * Overview-page entry point to the Liquidation Dashboard: no collateral,
 * collateral without a loan, or the seizure map with the price simulator.
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
  effectivePrice,
  simulating,
  onSimulate,
  onReset,
  onExplore,
}: {
  cascade: LiquidationCascade;
  effectivePrice: number;
  simulating: boolean;
  onSimulate: (price: number) => void;
  onReset: () => void;
  onExplore: () => void;
}) {
  const { bands, priceAxis, shareAxisTicks, cards } = useMemo(
    () =>
      buildLiquidationChartData(cascade.result, {
        btcPrice: effectivePrice,
        collateralFactor: cascade.collateralFactor,
        livePrice: cascade.btcPrice,
      }),
    [cascade, effectivePrice],
  );

  // Cards and bands share keys, so the chart's liquidated state is the
  // cards' liquidated state.
  const liquidatedKeys = useMemo(
    () =>
      new Set(bands.filter((b) => b.state === "liquidated").map((b) => b.key)),
    [bands],
  );

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

      {/* The simulator: downward-only from the live price, follows the drag
          live (spec: bottom of range is $0). */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Slider
            value={effectivePrice}
            min={0}
            max={cascade.btcPrice}
            step={SIM_PRICE_STEP_USD}
            steps={[]}
            onChange={onSimulate}
            activeColor={PRICE_SLIDER_COLOR}
            aria-label={COPY.liquidations.simulateLabel}
          />
        </div>
        <span className="min-w-[92px] rounded-md border border-secondary-strokeLight px-3 py-1.5 text-center text-sm font-medium tabular-nums text-accent-primary">
          {formatPriceUsd(effectivePrice)}
        </span>
        <button
          type="button"
          onClick={onReset}
          disabled={!simulating}
          className={`${NEUTRAL_BUTTON_CLASS} disabled:cursor-default disabled:opacity-40`}
        >
          {COPY.liquidations.reset}
        </button>
      </div>

      <div className="h-px w-full bg-secondary-strokeLight" />

      <SeizureMap
        bands={bands}
        currentPrice={effectivePrice}
        currentPriceLabel={formatPriceUsd(effectivePrice)}
        priceLineCaption={COPY.liquidations.bitcoinPriceCaption}
        priceAxis={priceAxis}
        shareAxisTicks={shareAxisTicks}
        showShareLegend={false}
        liquidatedLabel={COPY.liquidations.liquidatedBandLabel}
      />

      <div className="h-px w-full bg-secondary-strokeLight" />

      <div className="flex flex-col">
        <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
          {COPY.liquidations.events.heading}
        </span>
        <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
          {COPY.liquidations.events.subheading}
        </span>
      </div>

      <LiquidationEventCards
        cards={cards}
        liquidatedKeys={liquidatedKeys}
        simulating={simulating}
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
  const [simulatedPrice, setSimulatedPrice] = useState<number | null>(null);

  const showChart = hasCollateral && hasLoans && Boolean(cascade);
  const livePrice = cascade?.btcPrice ?? 0;
  // Downward-only: a live-price move below a stale simulated value re-clamps.
  const effectivePrice =
    simulatedPrice === null ? livePrice : Math.min(simulatedPrice, livePrice);
  const simulating = showChart && effectivePrice < livePrice;

  const summary = useMemo(
    () =>
      showChart && cascade
        ? buildSimulationSummary(cascade.result, effectivePrice)
        : null,
    [showChart, cascade, effectivePrice],
  );

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
  } else if (cascade) {
    body = (
      <LiquidationChartPanel
        cascade={cascade}
        effectivePrice={effectivePrice}
        simulating={simulating}
        onSimulate={setSimulatedPrice}
        onReset={() => setSimulatedPrice(null)}
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
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <div className="flex items-center gap-3">
          <Heading
            variant="h6"
            as="h2"
            className="font-normal text-accent-primary"
          >
            {COPY.liquidations.heading}
          </Heading>
          {summary ? (
            <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
              {COPY.liquidations.vaultsLiquidated(
                summary.vaultsLiquidated,
                summary.vaultsTotal,
              )}
            </span>
          ) : null}
          {simulating ? (
            <span className="rounded-full bg-warning-main/10 px-2.5 py-0.5 text-xs text-warning-main">
              {COPY.liquidations.simulationChip}
            </span>
          ) : null}
        </div>
        {summary ? (
          <div className="flex items-center gap-6 text-sm leading-[1.43] tracking-[0.17px]">
            <span className="text-accent-secondary">
              {COPY.liquidations.seizedSummaryLabel}{" "}
              <span
                data-testid="liq-seized-pct"
                className={twJoin(
                  "font-medium",
                  summary.seizedPct > 0
                    ? "text-error-main"
                    : "text-accent-primary",
                )}
              >
                {summary.seizedPct}%
              </span>
            </span>
            <span className="text-accent-secondary">
              {COPY.liquidations.collateralSummaryLabel}{" "}
              <span className="font-medium text-accent-primary">
                {summary.collateralRemainingLabel}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-6 rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-6 dark:bg-[#202020]">
        {body}
      </div>
    </div>
  );
}
