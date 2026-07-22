import { Heading, SeizureMap } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import { useNavigate } from "react-router";

import type { CalculatorResult } from "@/applications/aave/positionNotifications/types";
import {
  FIXTURE_BTC_PRICE,
  FIXTURE_CASCADE,
  FIXTURE_COLLATERAL_FACTOR,
} from "@/components/pages/Liquidations/fixtures";
import { buildLiquidationChartData } from "@/components/pages/Liquidations/liquidationChartData";
import { COPY } from "@/copy";
import { ROUTES } from "@/routes";
import { formatPriceUsd } from "@/utils/formatting";

/** God-mode manual cascade, injected by DashboardPage (the sanctioned dev seam). */
export interface LiquidationCascadeOverride {
  result: CalculatorResult;
  btcPrice: number;
  collateralFactor: number;
}

interface LiquidationAnalysisSectionProps {
  hasCollateral: boolean;
  hasLoans: boolean;
  onDeposit: () => void;
  onBorrow: () => void;
  cascadeOverride?: LiquidationCascadeOverride | null;
}

/**
 * Overview-page entry point to the Liquidation Dashboard: no collateral,
 * collateral without a loan, or the seizure map. There is no simulator here —
 * Explore hands off to the full page for that.
 *
 * The cascade is a fixture; the follow-up PR swaps it for the live
 * `usePositionNotifications` result DashboardPage already holds. The god-mode
 * panel's manual mode overrides it in the meantime.
 */

/** core-ui's `Button` is still on the pre-v3 spec. */
const BUTTON_CLASS =
  "flex h-10 w-[120px] shrink-0 items-center justify-center rounded-lg text-base leading-[1.5] tracking-[0.15px] transition-[filter] hover:brightness-110";
const PRIMARY_BUTTON_CLASS = `${BUTTON_CLASS} bg-secondary-main text-accent-contrast`;
const NEUTRAL_BUTTON_CLASS = `${BUTTON_CLASS} bg-secondary-strokeLight text-accent-primary`;

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

export function LiquidationAnalysisSection({
  hasCollateral,
  hasLoans,
  onDeposit,
  onBorrow,
  cascadeOverride,
}: LiquidationAnalysisSectionProps) {
  const navigate = useNavigate();

  const btcPrice = cascadeOverride?.btcPrice ?? FIXTURE_BTC_PRICE;

  const { bands, priceAxis, shareAxisTicks } = useMemo(
    () =>
      buildLiquidationChartData(cascadeOverride?.result ?? FIXTURE_CASCADE, {
        btcPrice,
        collateralFactor:
          cascadeOverride?.collateralFactor ?? FIXTURE_COLLATERAL_FACTOR,
      }),
    [cascadeOverride, btcPrice],
  );

  // The cascade only exists once there is debt to liquidate, so a deposit with
  // no loan gets its own prompt rather than an empty chart.
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
    body = (
      <EmptyState
        title={COPY.liquidations.empty.noLoanTitle}
        description={COPY.liquidations.empty.noLoanDescription}
        actionLabel={COPY.liquidations.empty.borrow}
        onAction={onBorrow}
      />
    );
  } else {
    body = (
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
            onClick={() => navigate(ROUTES.LIQUIDATIONS)}
            className={NEUTRAL_BUTTON_CLASS}
          >
            {COPY.liquidations.exploreAction}
          </button>
        </div>

        <div className="h-px w-full bg-secondary-strokeLight" />

        <SeizureMap
          bands={bands}
          currentPrice={btcPrice}
          currentPriceLabel={formatPriceUsd(btcPrice)}
          priceLineCaption={COPY.liquidations.bitcoinPriceCaption}
          priceAxis={priceAxis}
          shareAxisTicks={shareAxisTicks}
          showShareLegend={false}
        />
      </>
    );
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
