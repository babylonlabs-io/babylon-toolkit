import { Heading, SeizureMap } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import { useNavigate } from "react-router";

import type { CalculatorResult } from "@/applications/aave/positionNotifications/types";
import { buildLiquidationChartData } from "@/components/pages/Liquidations/liquidationChartData";
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

/**
 * Overview-page entry point to the Liquidation Dashboard: no collateral,
 * collateral without a loan, or the seizure map.
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
  const { bands, priceAxis, shareAxisTicks } = useMemo(
    () =>
      buildLiquidationChartData(cascade.result, {
        btcPrice: cascade.btcPrice,
        collateralFactor: cascade.collateralFactor,
      }),
    [cascade],
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

      <div className="h-px w-full bg-secondary-strokeLight" />

      <SeizureMap
        bands={bands}
        currentPrice={cascade.btcPrice}
        currentPriceLabel={formatPriceUsd(cascade.btcPrice)}
        priceLineCaption={COPY.liquidations.bitcoinPriceCaption}
        priceAxis={priceAxis}
        shareAxisTicks={shareAxisTicks}
        showShareLegend={false}
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
