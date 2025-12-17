/**
 * Borrow Tab Component
 *
 * Handles the complete borrow flow including transaction execution.
 * Gets all required data from LoanContext.
 */

import { AmountSlider, Button, SubSection } from "@babylonlabs-io/core-ui";

import { getCurrencyIconWithFallback } from "../../../../../services/token";
import { MIN_SLIDER_MAX } from "../../../constants";
import { useBorrowTransaction } from "../../../hooks";
import { useLoanContext } from "../../context/LoanContext";

import { BorrowDetailsCard } from "./BorrowDetailsCard";
import { useBorrowMetrics } from "./hooks/useBorrowMetrics";
import { useBorrowState } from "./hooks/useBorrowState";
import { validateBorrowAction } from "./hooks/validateBorrowAction";

export function Borrow() {
  const {
    collateralValueUsd,
    currentDebtUsd,
    healthFactor,
    liquidationThresholdBps,
    selectedReserve,
    assetConfig,
    positionId,
    onBorrowSuccess,
  } = useLoanContext();

  const { executeBorrow, isProcessing } = useBorrowTransaction({ positionId });

  const { borrowAmount, setBorrowAmount, resetBorrowAmount, maxBorrowAmount } =
    useBorrowState({
      collateralValueUsd,
      currentDebtUsd,
    });

  const metrics = useBorrowMetrics({
    borrowAmount,
    collateralValueUsd,
    currentDebtUsd,
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
              balance: sliderMaxBorrow.toLocaleString(),
              symbol: assetConfig.symbol,
              displayUSD: false,
            }}
            sliderValue={borrowAmount}
            sliderMin={0}
            sliderMax={sliderMaxBorrow}
            sliderStep={sliderMaxBorrow / 1000}
            sliderSteps={[]}
            onSliderChange={setBorrowAmount}
            sliderVariant="primary"
            leftField={{
              label: "Max",
              value: `${sliderMaxBorrow.toLocaleString()} ${assetConfig.symbol}`,
            }}
            onMaxClick={() => setBorrowAmount(sliderMaxBorrow)}
            rightField={{
              value: `$${borrowAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} USD`,
            }}
            sliderActiveColor="#0B53BF"
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
      </div>

      {/* Borrow Button */}
      <Button
        variant="contained"
        color="secondary"
        size="large"
        fluid
        disabled={isDisabled || isProcessing}
        onClick={handleBorrow}
        className="mt-6"
      >
        {isProcessing ? "Processing..." : buttonText}
      </Button>
    </div>
  );
}
