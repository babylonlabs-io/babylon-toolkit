/**
 * Repay Tab Component
 *
 * Handles the complete repay flow including transaction execution.
 * Gets all required data from LoanContext.
 */

import { AmountSlider, Button, SubSection } from "@babylonlabs-io/core-ui";

import {
  getCurrencyIconWithFallback,
  getTokenBrandColor,
} from "../../../../../services/token";
import { formatUsdValue } from "../../../../../utils/formatting";
import { AMOUNT_INPUT_CLASS_NAME, MIN_SLIDER_MAX } from "../../../constants";
import { useRepayTransaction } from "../../../hooks";
import { useLoanContext } from "../../context/LoanContext";
import { BorrowDetailsCard } from "../Borrow/BorrowDetailsCard";

import { useRepayMetrics } from "./hooks/useRepayMetrics";
import { useRepayState } from "./hooks/useRepayState";
import { validateRepayAction } from "./hooks/validateRepayAction";

export function Repay() {
  const {
    collateralValueUsd,
    currentDebtAmount,
    totalDebtValueUsd,
    healthFactor,
    liquidationThresholdBps,
    selectedReserve,
    assetConfig,
    positionId,
    proxyContract,
    onRepaySuccess,
  } = useLoanContext();

  const { executeRepay, isProcessing } = useRepayTransaction({
    positionId,
    proxyContract,
  });

  const {
    repayAmount,
    setRepayAmount,
    resetRepayAmount,
    maxRepayAmount,
    isFullRepayment,
  } = useRepayState({
    currentDebtAmount,
  });

  const metrics = useRepayMetrics({
    repayAmount,
    collateralValueUsd,
    totalDebtValueUsd,
    liquidationThresholdBps,
    currentHealthFactor: healthFactor,
  });

  const { isDisabled, buttonText, errorMessage } = validateRepayAction(
    repayAmount,
    maxRepayAmount,
  );

  const sliderMaxRepay = Math.max(maxRepayAmount, MIN_SLIDER_MAX);

  const handleRepay = async () => {
    const success = await executeRepay(
      repayAmount,
      selectedReserve,
      isFullRepayment,
    );
    if (success) {
      resetRepayAmount();
      onRepaySuccess(repayAmount, 0);
    }
  };

  return (
    <div>
      {/* Repay Amount Section */}
      <h3 className="mb-4 text-[24px] font-normal text-accent-primary">
        Repay
      </h3>
      <div className="flex flex-col gap-2">
        <SubSection>
          <AmountSlider
            amount={repayAmount}
            currencyIcon={getCurrencyIconWithFallback(
              assetConfig.icon,
              assetConfig.symbol,
            )}
            currencyName={assetConfig.name}
            onAmountChange={(e) =>
              setRepayAmount(parseFloat(e.target.value) || 0)
            }
            balanceDetails={{
              balance: sliderMaxRepay.toLocaleString(),
              symbol: assetConfig.symbol,
              displayUSD: false,
            }}
            sliderValue={repayAmount}
            sliderMin={0}
            sliderMax={sliderMaxRepay}
            sliderStep={sliderMaxRepay / 1000}
            sliderSteps={[]}
            onSliderChange={setRepayAmount}
            sliderVariant="rainbow"
            leftField={{
              label: "Max",
              value: `${sliderMaxRepay.toLocaleString()} ${assetConfig.symbol}`,
            }}
            onMaxClick={() => setRepayAmount(sliderMaxRepay)}
            rightField={{
              value: formatUsdValue(repayAmount),
            }}
            sliderActiveColor={getTokenBrandColor(assetConfig.symbol)}
            inputClassName={AMOUNT_INPUT_CLASS_NAME}
          />
        </SubSection>

        <BorrowDetailsCard
          borrowRatio={metrics.borrowRatio}
          borrowRatioOriginal={metrics.borrowRatioOriginal}
          healthFactor={metrics.healthFactor}
          healthFactorValue={metrics.healthFactorValue}
          healthFactorOriginal={metrics.healthFactorOriginal}
          healthFactorOriginalValue={metrics.healthFactorOriginalValue}
        />

        {errorMessage && (
          <p className="text-sm text-error-main">{errorMessage}</p>
        )}
      </div>

      {/* Repay Button */}
      <Button
        variant="contained"
        color="secondary"
        size="large"
        fluid
        disabled={isDisabled || isProcessing}
        onClick={handleRepay}
        className="mt-6"
      >
        {isProcessing ? "Processing..." : buttonText}
      </Button>
    </div>
  );
}
