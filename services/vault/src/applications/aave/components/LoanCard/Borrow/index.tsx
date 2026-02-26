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

export function Borrow() {
  const {
    collateralValueUsd,
    totalDebtValueUsd,
    healthFactor,
    liquidationThresholdBps,
    selectedReserve,
    assetConfig,
    onBorrowSuccess,
  } = useLoanContext();

  const { executeBorrow, isProcessing } = useBorrowTransaction();

  const { borrowAmount, setBorrowAmount, resetBorrowAmount, maxBorrowAmount } =
    useBorrowState({
      collateralValueUsd,
      currentDebtUsd: totalDebtValueUsd,
    });

  const metrics = useBorrowMetrics({
    borrowAmount,
    collateralValueUsd,
    currentDebtUsd: totalDebtValueUsd,
    liquidationThresholdBps,
    currentHealthFactor: healthFactor,
  });

  const { isDisabled, buttonText, errorMessage } = validateBorrowAction(
    borrowAmount,
    metrics.healthFactorValue,
  );

  const sliderMaxBorrow = Math.max(maxBorrowAmount, MIN_SLIDER_MAX);

  const handleBorrow = async () => {
    const success = await executeBorrow(borrowAmount, selectedReserve);
    if (success) {
      resetBorrowAmount();
      onBorrowSuccess(borrowAmount);
    }
  };

  const getBorrowButtonText = () => {
    if (!FeatureFlags.isBorrowEnabled) return "Borrowing Unavailable";
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
              balance: formatTokenAmount(sliderMaxBorrow),
              symbol: assetConfig.symbol,
              displayUSD: false,
            }}
            sliderValue={borrowAmount}
            sliderMin={0}
            sliderMax={sliderMaxBorrow}
            sliderStep={sliderMaxBorrow / 1000}
            sliderSteps={[]}
            onSliderChange={setBorrowAmount}
            sliderVariant="rainbow"
            leftField={{
              label: "Max",
              value: `${formatTokenAmount(sliderMaxBorrow)} ${assetConfig.symbol}`,
            }}
            onMaxClick={() => setBorrowAmount(sliderMaxBorrow)}
            rightField={{
              value: formatUsdValue(borrowAmount),
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

        {/* Borrow Unavailable Message */}
        {!FeatureFlags.isBorrowEnabled && (
          <Text variant="body2" className="text-center text-warning-main">
            Borrowing is temporarily unavailable. Please check back later.
          </Text>
        )}
      </div>

      {/* Borrow Button */}
      <Button
        variant="contained"
        color="secondary"
        size="large"
        fluid
        disabled={isDisabled || isProcessing || !FeatureFlags.isBorrowEnabled}
        onClick={handleBorrow}
        className="mt-6"
      >
        {getBorrowButtonText()}
      </Button>
    </div>
  );
}
