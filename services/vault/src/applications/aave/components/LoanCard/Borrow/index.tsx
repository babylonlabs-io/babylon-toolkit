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
import { useAaveBorrowAprs, useBorrowTransaction } from "../../../hooks";
import { AssetPill } from "../../AssetPill";
import { useLoanContext } from "../../context/LoanContext";

import { BorrowMetricsCard } from "./BorrowMetricsCard";
import { useBorrowMetrics } from "./hooks/useBorrowMetrics";
import { useBorrowState } from "./hooks/useBorrowState";
import { validateBorrowAction } from "./hooks/validateBorrowAction";
import { validateBorrowPreSign } from "./hooks/validateBorrowPreSign";

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
  } = useLoanContext();

  const {
    executeBorrow,
    isProcessing,
    error: txError,
  } = useBorrowTransaction();

  const { borrowAmount, setBorrowAmount, resetBorrowAmount, maxBorrowAmount } =
    useBorrowState({
      collateralValueUsd,
      currentDebtUsd: totalDebtValueUsd,
      liquidationThresholdBps,
      tokenPriceUsd,
      tokenDecimals: selectedReserve.token.decimals,
    });

  // Reset the entered amount whenever the borrow asset changes. The form is no
  // longer remounted on switch (see `useAaveReservePrice` keepPreviousData), so
  // clear the amount explicitly — a value sized for the previous asset's max is
  // meaningless against a different reserve.
  useEffect(() => {
    setBorrowAmount(0);
  }, [selectedReserve.reserveId, setBorrowAmount]);

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
    maxBorrowAmount,
    selectedReserve.token.decimals,
    isPositionDataStale,
  );

  // Cosmetic minimum only — keeps the slider track from rendering at zero
  // width when there is nothing to borrow. The "Max" label and the slider's
  // accept range use the real `maxBorrowAmount` so the UI doesn't advertise
  // a value that validation will reject.
  const sliderTrackMax = maxBorrowAmount > 0 ? maxBorrowAmount : MIN_SLIDER_MAX;
  const displayDecimals = Math.min(
    selectedReserve.token.decimals,
    SAFE_TOFIXED_PRECISION,
  );

  const hasProjection = borrowAmount > 0;

  const { borrowableReserves } = useAaveConfig();

  // Live current borrow APR for the selected reserve (Aave Hub drawn rate).
  // The projected post-borrow rate isn't a simple read, so only "current"
  // shows real data; the other metric rows remain placeholders ("–").
  const { aprPercentByReserveId } = useAaveBorrowAprs({
    reserves: [selectedReserve],
  });
  const borrowAprPercent =
    aprPercentByReserveId[selectedReserve.reserveId.toString()];
  const borrowAprDisplay =
    borrowAprPercent == null
      ? COPY.common.emptyValue
      : formatAprPercent(borrowAprPercent);

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
    if (FeatureFlags.isBorrowDisabled) return "Borrowing Unavailable";
    if (isProcessing) return "Processing...";
    return buttonText;
  };

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
              setBorrowAmount(parseFloat(e.target.value) || 0)
            }
            sliderValue={borrowAmount}
            sliderMin={0}
            sliderMax={sliderTrackMax}
            sliderStep={sliderTrackMax / 1000}
            sliderSteps={[]}
            onSliderChange={setBorrowAmount}
            sliderVariant="rainbow"
            leftField={{
              value:
                borrowAmount === 0
                  ? COPY.common.zeroUsdValue
                  : tokenPriceUsd != null
                    ? formatUsdValue(borrowAmount * tokenPriceUsd)
                    : "–",
            }}
            onMaxClick={() => {
              if (isPriceReady) setBorrowAmount(maxBorrowAmount);
            }}
            rightField={{
              label: COPY.loans.availableLabel,
              value: isPriceReady
                ? `${formatTokenAmount(maxBorrowAmount, displayDecimals)} ${assetConfig.symbol}`
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
                <WarningIcon size={18} color="text-error-light" />
              </span>
              <Text variant="body2" className="text-accent-secondary">
                {COPY.loans.atRiskOfLiquidation}
              </Text>
            </div>
          )}
        </SubSection>

        {/* Borrow Metrics */}
        <BorrowMetricsCard
          borrowApr={borrowAprDisplay}
          healthFactor={metrics.healthFactor}
          healthFactorValue={metrics.healthFactorValue}
          healthFactorOriginal={metrics.healthFactorOriginal}
          healthFactorOriginalValue={metrics.healthFactorOriginalValue}
        />

        {/* Health Factor Error */}
        {errorMessage && (
          <p className="text-sm text-error-main">{errorMessage}</p>
        )}

        {/* Borrow Unavailable Messages */}
        {FeatureFlags.isBorrowDisabled && (
          <Text variant="body2" className="text-center text-warning-main">
            Borrowing is temporarily unavailable. Please check back later.
          </Text>
        )}
        {(tokenPriceUsd == null || oracleAddress == null) &&
          !FeatureFlags.isBorrowDisabled && (
            <Text variant="body2" className="text-center text-warning-main">
              Price data unavailable. Borrowing is temporarily disabled.
            </Text>
          )}
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

      {/* Transaction error */}
      {txError && (
        <Callout
          variant="error"
          title={COPY.loans.transactionFailedTitle}
          className="mt-4"
        >
          {txError}
        </Callout>
      )}

      {/* Ethereum Network Fee */}
      <div className="mt-6 flex w-full items-center justify-between text-sm">
        <span className="text-accent-primary">
          {COPY.loans.ethereumNetworkFeeLabel}
        </span>
        <span className="text-accent-secondary">{COPY.common.emptyValue}</span>
      </div>
    </div>
  );
}
