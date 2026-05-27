/**
 * Borrow Tab Component
 *
 * Handles the complete borrow flow including transaction execution.
 * Gets all required data from LoanContext.
 */

import {
  AmountSlider,
  Button,
  SubSection,
  Text,
} from "@babylonlabs-io/core-ui";

import { FeatureFlags } from "@/config";

import {
  getCurrencyIconWithFallback,
  getTokenBrandColor,
} from "../../../../../services/token";
import {
  formatTokenAmount,
  formatUsdValue,
} from "../../../../../utils/formatting";
import { AMOUNT_INPUT_CLASS_NAME, MIN_SLIDER_MAX } from "../../../constants";
import { useBorrowTransaction } from "../../../hooks";
import { useLoanContext } from "../../context/LoanContext";

import { BorrowDetailsCard } from "./BorrowDetailsCard";
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
    isPositionDataStale,
    refetchPosition,
    refetchSplitParams,
    onBorrowSuccess,
  } = useLoanContext();

  const { executeBorrow, isProcessing } = useBorrowTransaction();

  const { borrowAmount, setBorrowAmount, resetBorrowAmount, maxBorrowAmount } =
    useBorrowState({
      collateralValueUsd,
      currentDebtUsd: totalDebtValueUsd,
      liquidationThresholdBps,
      tokenPriceUsd,
    });

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
    isPositionDataStale,
  );

  // Cosmetic minimum only — keeps the slider track from rendering at zero
  // width when there is nothing to borrow. The "Max" label and the slider's
  // accept range use the real `maxBorrowAmount` so the UI doesn't advertise
  // a value that validation will reject.
  const sliderTrackMax = maxBorrowAmount > 0 ? maxBorrowAmount : MIN_SLIDER_MAX;

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
        <SubSection>
          <AmountSlider
            amount={borrowAmount}
            currencyIcon={getCurrencyIconWithFallback(
              assetConfig.icon,
              assetConfig.symbol,
            )}
            currencyName={assetConfig.name}
            onAmountChange={(e) =>
              setBorrowAmount(parseFloat(e.target.value) || 0)
            }
            balanceDetails={{
              balance: formatTokenAmount(maxBorrowAmount),
              symbol: assetConfig.symbol,
              displayUSD: false,
            }}
            sliderValue={borrowAmount}
            sliderMin={0}
            sliderMax={sliderTrackMax}
            sliderStep={sliderTrackMax / 1000}
            sliderSteps={[]}
            onSliderChange={setBorrowAmount}
            sliderVariant="rainbow"
            leftField={{
              label: "Max",
              value: `${formatTokenAmount(maxBorrowAmount)} ${assetConfig.symbol}`,
            }}
            onMaxClick={() => setBorrowAmount(maxBorrowAmount)}
            rightField={{
              value:
                tokenPriceUsd != null
                  ? formatUsdValue(borrowAmount * tokenPriceUsd)
                  : "–",
            }}
            sliderActiveColor={getTokenBrandColor(assetConfig.symbol)}
            inputClassName={AMOUNT_INPUT_CLASS_NAME}
          />
        </SubSection>

        {/* Borrow Details Card */}
        <BorrowDetailsCard
          borrowRatio={metrics.borrowRatio}
          borrowRatioOriginal={metrics.borrowRatioOriginal}
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
          tokenPriceUsd == null ||
          oracleAddress == null
        }
        onClick={handleBorrow}
        className="mt-6"
      >
        {getBorrowButtonText()}
      </Button>
    </div>
  );
}
