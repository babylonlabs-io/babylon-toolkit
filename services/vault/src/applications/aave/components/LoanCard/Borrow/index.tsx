/**
 * Borrow Tab Component
 *
 * Handles the complete borrow flow including transaction execution.
 * Gets all required data from LoanContext.
 */

import {
  AmountSlider,
  Button,
  Callout,
  Loader,
  SubSection,
  Text,
  WarningIcon,
} from "@babylonlabs-io/core-ui";
import { useEffect } from "react";

import { getHealthFactorStatusFromValue } from "@/applications/aave/utils";
import { FeatureFlags } from "@/config";
import { COPY } from "@/copy";

import {
  getCurrencyIconWithFallback,
  getTokenBrandColor,
} from "../../../../../services/token";
import {
  formatAprPercent,
  formatBasisPointsAsPercent,
  formatCompactTokenAmount,
  formatTokenAmount,
  formatUsdValue,
} from "../../../../../utils/formatting";
import {
  AMOUNT_INPUT_CLASS_NAME,
  LOAN_TAB,
  MAX_BUTTON_CLASS_NAME,
  MIN_SLIDER_MAX,
  SAFE_TOFIXED_PRECISION,
} from "../../../constants";
import { useAaveConfig } from "../../../context";
import {
  useAaveBorrowAprs,
  useAaveReserveLiquidity,
  useBorrowNetworkFee,
  useBorrowTransaction,
} from "../../../hooks";
import { AssetPill } from "../../AssetPill";
import { useLoanContext } from "../../context/LoanContext";

import { BorrowMetricsCard } from "./BorrowMetricsCard";
import { useBorrowMetrics } from "./hooks/useBorrowMetrics";
import { useBorrowState } from "./hooks/useBorrowState";
import { validateBorrowAction } from "./hooks/validateBorrowAction";
import { validateBorrowPreSign } from "./hooks/validateBorrowPreSign";

/**
 * Borrow at most this fraction of a reserve's available liquidity. The small
 * margin keeps "Max" from advertising the exact remaining amount — borrowing
 * the reserve down to zero can revert under some pool configs, so leaving a
 * sliver avoids a fail-at-Max edge while the on-chain draw stays the backstop.
 */
const MAX_BORROWABLE_LIQUIDITY_FRACTION = 0.999;

export function Borrow() {
  const {
    collateralValueUsd,
    totalDebtValueUsd,
    healthFactor,
    liquidationThresholdBps,
    selectedReserve,
    assetConfig,
    oracleAddress,
    tokenPriceUsd,
    isPriceStale,
    isPositionDataStale,
    refetchPosition,
    refetchSplitParams,
    onBorrowSuccess,
    onProcessingChange,
  } = useLoanContext();

  const {
    executeBorrow,
    isProcessing,
    error: txError,
    clearError,
  } = useBorrowTransaction();

  const { borrowAmount, setBorrowAmount, resetBorrowAmount, maxBorrowAmount } =
    useBorrowState({
      collateralValueUsd,
      currentDebtUsd: totalDebtValueUsd,
      liquidationThresholdBps,
      tokenPriceUsd,
      tokenDecimals: selectedReserve.token.decimals,
    });

  // Live available liquidity for the selected reserve (Aave Hub reserve totals);
  // also drives the metrics card below. Falls back to "–" while loading/failed.
  const { liquidityByReserveId } = useAaveReserveLiquidity({
    reserves: [selectedReserve],
  });
  const reserveLiquidity =
    liquidityByReserveId[selectedReserve.reserveId.toString()];

  // You can't borrow more than the reserve holds, so cap the collateral-based
  // max by available liquidity (less a safety margin) when it's known. Additive:
  // when the read is loading or failed (reserveLiquidity == null) the cap is
  // skipped, so a best-effort display read can never block an otherwise-fundable
  // borrow.
  const liquidityCap =
    reserveLiquidity == null
      ? Infinity
      : reserveLiquidity.availableLiquidity * MAX_BORROWABLE_LIQUIDITY_FRACTION;
  const effectiveMaxBorrowAmount = Math.min(maxBorrowAmount, liquidityCap);
  const limitedByLiquidity = effectiveMaxBorrowAmount < maxBorrowAmount;

  // Reset the entered amount whenever the borrow asset changes. The form is no
  // longer remounted on switch (see `useAaveReservePrice` keepPreviousData), so
  // clear the amount and the last failed-tx error explicitly — both belong to
  // the previous reserve and would otherwise mislabel the newly selected one.
  useEffect(() => {
    setBorrowAmount(0);
    clearError();
  }, [selectedReserve.reserveId, setBorrowAmount, clearError]);

  // Mirror the in-flight state up to the detail screen so it can lock the
  // dialog's close affordances during signing — see AaveReserveDetail.
  useEffect(() => {
    onProcessingChange(isProcessing);
  }, [isProcessing, onProcessingChange]);

  // Editing the amount drops a stale failed-tx error so it can't re-surface
  // through the status-callout priority chain once a validation error clears.
  const handleAmountChange = (amount: number) => {
    clearError();
    setBorrowAmount(amount);
  };

  // While the oracle price still belongs to the previously-selected reserve
  // (carried over to avoid a remount), withhold price-derived figures and keep
  // the action disabled rather than show a stale max/available for the new one.
  const isPriceReady = tokenPriceUsd != null && !isPriceStale;

  const metrics = useBorrowMetrics({
    borrowAmount,
    collateralValueUsd,
    currentDebtUsd: totalDebtValueUsd,
    liquidationThresholdBps,
    currentHealthFactor: healthFactor,
    tokenPriceUsd,
  });

  const { isDisabled, buttonText, errorMessage } = validateBorrowAction(
    borrowAmount,
    metrics.healthFactorValue,
    effectiveMaxBorrowAmount,
    selectedReserve.token.decimals,
    assetConfig.symbol,
    isPositionDataStale,
    limitedByLiquidity,
  );

  // Cosmetic minimum only — keeps the slider track from rendering at zero
  // width when there is nothing to borrow. The "Max" label and the slider's
  // accept range use `effectiveMaxBorrowAmount` so the UI doesn't advertise a
  // value (beyond collateral capacity or available liquidity) that validation
  // will reject.
  const sliderTrackMax =
    effectiveMaxBorrowAmount > 0 ? effectiveMaxBorrowAmount : MIN_SLIDER_MAX;
  const displayDecimals = Math.min(
    selectedReserve.token.decimals,
    SAFE_TOFIXED_PRECISION,
  );

  const hasProjection = borrowAmount > 0;

  // Estimate the borrow tx's Ethereum network fee once the entered amount
  // passes validation (`!isDisabled`); eth_estimateGas then simulates a
  // submittable borrow rather than reverting on a mid-edit or unsafe amount.
  // Not gated on `isPriceReady`: the gas estimate is independent of the
  // borrow-token oracle (only the ETH price matters, for the optional USD
  // suffix, which `formatNetworkFee` omits gracefully when unavailable).
  const networkFee = useBorrowNetworkFee({
    reserve: selectedReserve,
    amount: borrowAmount,
    enabled: !isDisabled,
  });

  const { borrowableReserves } = useAaveConfig();

  // Live current borrow APR for the selected reserve (Aave Hub drawn rate).
  // The projected post-borrow rate isn't a simple read, so only "current"
  // shows real data.
  const { aprPercentByReserveId } = useAaveBorrowAprs({
    reserves: [selectedReserve],
  });
  const borrowAprPercent =
    aprPercentByReserveId[selectedReserve.reserveId.toString()];
  const borrowAprDisplay =
    borrowAprPercent == null
      ? COPY.common.emptyValue
      : formatAprPercent(borrowAprPercent);

  // Borrowing draws the entered amount from the reserve, so the row shows the
  // current liquidity reducing to the post-borrow figure (current → projected),
  // mirroring the health-factor row. The arrow only appears once an amount is
  // entered; the symbol is shown once, on whichever value is the last shown.
  const availableLiquidityProjectedDisplay =
    reserveLiquidity == null || !hasProjection
      ? undefined
      : `${formatCompactTokenAmount(Math.max(0, reserveLiquidity.availableLiquidity - borrowAmount))} ${assetConfig.symbol}`;
  const availableLiquidityDisplay =
    reserveLiquidity == null
      ? COPY.common.emptyValue
      : availableLiquidityProjectedDisplay
        ? formatCompactTokenAmount(reserveLiquidity.availableLiquidity)
        : `${formatCompactTokenAmount(reserveLiquidity.availableLiquidity)} ${assetConfig.symbol}`;
  const utilizationDisplay =
    reserveLiquidity?.utilizationBps == null
      ? COPY.common.emptyValue
      : formatBasisPointsAsPercent(reserveLiquidity.utilizationBps);

  const projectedHealthStatus = getHealthFactorStatusFromValue(
    metrics.healthFactorValue,
  );
  const showAtRiskCallout =
    hasProjection &&
    (projectedHealthStatus === "warning" || projectedHealthStatus === "danger");

  const handleBorrow = async () => {
    // Defensive: the disabled prop already gates on `oracleAddress == null`.
    if (oracleAddress == null) return;
    const success = await executeBorrow(borrowAmount, selectedReserve, () =>
      validateBorrowPreSign({
        borrowAmount,
        oracleAddress,
        reserveId: selectedReserve.reserveId,
        liquidationThresholdBps,
        refetchSplitParams,
        refetchPosition,
      }),
    );
    if (success) {
      resetBorrowAmount();
      onBorrowSuccess(borrowAmount);
    }
  };

  const getBorrowButtonText = () => {
    if (FeatureFlags.isBorrowDisabled) return COPY.loans.borrow.unavailable;
    if (isProcessing) return COPY.loans.borrow.processing;
    return buttonText;
  };

  // A single status callout, rendered once below the action button. Highest
  // priority first: a current input/validation error, then the last failed
  // transaction, then the standing "can't borrow" warnings.
  const statusCallout: {
    variant: "error" | "warning";
    title?: string;
    body: string;
  } | null = errorMessage
    ? { variant: "error", title: buttonText, body: errorMessage }
    : txError
      ? {
          variant: "error",
          title: COPY.loans.transactionFailedTitle,
          body: txError,
        }
      : FeatureFlags.isBorrowDisabled
        ? { variant: "warning", body: COPY.loans.borrowingUnavailable }
        : tokenPriceUsd == null || oracleAddress == null
          ? { variant: "warning", body: COPY.loans.priceUnavailable }
          : null;

  return (
    <div>
      {/* Borrow Amount Section */}
      <h3 className="mb-4 text-[24px] font-normal text-accent-primary">
        Borrow
      </h3>
      <div className="flex flex-col gap-2">
        <SubSection className="gap-4 !bg-secondary-highlight">
          <AmountSlider
            amount={borrowAmount}
            disabled={isProcessing}
            currencyIcon={getCurrencyIconWithFallback(
              assetConfig.icon,
              assetConfig.symbol,
            )}
            currencyName={assetConfig.name}
            currencySlot={
              <AssetPill
                symbol={assetConfig.symbol}
                icon={getCurrencyIconWithFallback(
                  assetConfig.icon,
                  assetConfig.symbol,
                )}
                reserves={borrowableReserves}
                mode={LOAN_TAB.BORROW}
                disabled={isProcessing}
              />
            }
            onAmountChange={(e) =>
              handleAmountChange(parseFloat(e.target.value) || 0)
            }
            sliderValue={borrowAmount}
            sliderMin={0}
            sliderMax={sliderTrackMax}
            sliderStep={sliderTrackMax / 1000}
            sliderSteps={[]}
            onSliderChange={handleAmountChange}
            sliderVariant="primary"
            leftField={{
              value:
                borrowAmount === 0
                  ? COPY.common.zeroUsdValue
                  : tokenPriceUsd != null
                    ? formatUsdValue(borrowAmount * tokenPriceUsd)
                    : COPY.common.emptyValue,
            }}
            onMaxClick={() => {
              if (isPriceReady) handleAmountChange(effectiveMaxBorrowAmount);
            }}
            rightField={{
              label: COPY.loans.availableLabel,
              value: isPriceReady
                ? `${formatTokenAmount(effectiveMaxBorrowAmount, displayDecimals)} ${assetConfig.symbol}`
                : COPY.common.emptyValue,
            }}
            maxPosition="right"
            maxButtonClassName={MAX_BUTTON_CLASS_NAME}
            sliderActiveColor={getTokenBrandColor(assetConfig.symbol)}
            inputClassName={AMOUNT_INPUT_CLASS_NAME}
          />

          {showAtRiskCallout && (
            <div
              role="alert"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-secondary-strokeLight px-4 py-2"
            >
              <span aria-hidden="true" className="flex">
                <WarningIcon size={18} color="text-warning-main" />
              </span>
              <Text variant="body2" className="text-accent-secondary">
                {COPY.loans.atRiskOfLiquidation}
              </Text>
            </div>
          )}
        </SubSection>

        {/* Borrow Metrics */}
        <BorrowMetricsCard
          availableLiquidity={availableLiquidityDisplay}
          availableLiquidityProjected={availableLiquidityProjectedDisplay}
          borrowApr={borrowAprDisplay}
          utilization={utilizationDisplay}
          healthFactor={metrics.healthFactor}
          healthFactorValue={metrics.healthFactorValue}
          healthFactorOriginal={metrics.healthFactorOriginal}
          healthFactorOriginalValue={metrics.healthFactorOriginalValue}
        />
      </div>

      {/* Borrow Button */}
      <Button
        variant="contained"
        color="secondary"
        size="large"
        fluid
        disabled={
          isDisabled ||
          isProcessing ||
          FeatureFlags.isBorrowDisabled ||
          !isPriceReady ||
          oracleAddress == null
        }
        onClick={handleBorrow}
        className="mt-2 disabled:!bg-accent-disabled disabled:!opacity-100"
      >
        {getBorrowButtonText()}
      </Button>

      {/* Single status callout (validation / transaction / availability) */}
      {statusCallout && (
        <Callout
          variant={statusCallout.variant}
          title={statusCallout.title}
          className="mt-4"
        >
          {statusCallout.body}
        </Callout>
      )}

      {/* Ethereum Network Fee */}
      <div className="mt-6 flex w-full items-center justify-between text-sm">
        <span className="text-accent-primary">
          {COPY.loans.ethereumNetworkFeeLabel}
        </span>
        <span className="flex items-center text-accent-secondary">
          {networkFee.isLoading ? (
            <Loader size={16} className="text-accent-secondary" />
          ) : (
            (networkFee.display ?? COPY.common.emptyValue)
          )}
        </span>
      </div>
    </div>
  );
}
