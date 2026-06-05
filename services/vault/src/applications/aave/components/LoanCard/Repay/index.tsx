/**
 * Repay Tab Component
 *
 * Handles the complete repay flow including transaction execution.
 * Gets all required data from LoanContext.
 */

import { AmountSlider, Button, SubSection } from "@babylonlabs-io/core-ui";
import { useCallback, useState } from "react";

import { useETHWallet } from "@/context/wallet";
import { useERC20Balance } from "@/hooks";

import {
  getCurrencyIconWithFallback,
  getTokenBrandColor,
} from "../../../../../services/token";
import {
  formatTokenAmount,
  formatUsdValue,
} from "../../../../../utils/formatting";
import {
  AMOUNT_INPUT_CLASS_NAME,
  MIN_SLIDER_MAX,
  SAFE_TOFIXED_PRECISION,
  SLIDER_STEP_COUNT,
} from "../../../constants";
import { useRepayTransaction, type RepayMode } from "../../../hooks";
import { useLoanContext } from "../../context/LoanContext";
import { BorrowDetailsCard } from "../Borrow/BorrowDetailsCard";

import { pickRepayParams } from "./hooks/pickRepayParams";
import { useRepayMetrics } from "./hooks/useRepayMetrics";
import { useRepayState } from "./hooks/useRepayState";
import { validateRepayAction } from "./hooks/validateRepayAction";
import { validateRepayPreSign } from "./hooks/validateRepayPreSign";

export function Repay() {
  const {
    collateralValueUsd,
    currentDebtAmount,
    totalDebtValueUsd,
    healthFactor,
    liquidationThresholdBps,
    selectedReserve,
    assetConfig,
    proxyContract,
    tokenPriceUsd,
    refetchPosition,
    refetchSplitParams,
    onRepaySuccess,
  } = useLoanContext();

  const { address } = useETHWallet();

  // Fetch user's token balance for repayment
  const { balance: userTokenBalance, refetch: refetchUserBalance } =
    useERC20Balance(
      selectedReserve.token.address,
      address,
      selectedReserve.token.decimals,
    );

  const { executeRepay, isProcessing } = useRepayTransaction({
    proxyContract,
  });

  const {
    repayAmount,
    setRepayAmount,
    setRepayAmountSlider,
    setRepayAmountMax,
    resetRepayAmount,
    maxRepayAmount,
    isMaxIntent,
  } = useRepayState({
    currentDebtAmount,
    userTokenBalance,
  });

  const metrics = useRepayMetrics({
    repayAmount,
    collateralValueUsd,
    totalDebtValueUsd,
    liquidationThresholdBps,
    currentHealthFactor: healthFactor,
    tokenPriceUsd,
  });

  // Token's own precision so dust (e.g. 0.00000003 WBTC) isn't rounded to "0.00".
  const displayDecimals = Math.min(
    selectedReserve.token.decimals,
    SAFE_TOFIXED_PRECISION,
  );

  const { isDisabled, buttonText, errorMessage, warningMessage } =
    validateRepayAction(
      repayAmount,
      maxRepayAmount,
      currentDebtAmount,
      userTokenBalance,
      displayDecimals,
    );

  // Cosmetic floor only: keeps the slider track from collapsing to zero
  // width when there's nothing to repay. Label + accept range use the real
  // `maxRepayAmount`.
  const sliderTrackMax = maxRepayAmount > 0 ? maxRepayAmount : MIN_SLIDER_MAX;

  const [refetchError, setRefetchError] = useState<string | null>(null);

  // Pure UI action: pre-fill the input with the cached max so the user sees
  // a number, and flag Max intent. The actual refetch + mode selection
  // happens at submit time (see `handleRepay`) so the bigint we feed into
  // `repayMaxCapped` is read from chain in the same tick we ask the wallet
  // to sign — eliminating the click→submit stale-snapshot window.
  const handleMaxClick = useCallback(() => {
    setRefetchError(null);
    setRepayAmountMax(maxRepayAmount);
  }, [maxRepayAmount, setRepayAmountMax]);

  const handleRepay = async () => {
    let mode: RepayMode = "partial";
    let amount = repayAmount;
    let amountRaw: bigint | null = null;

    if (isMaxIntent) {
      const params = await pickRepayParams({
        refetchPosition,
        refetchUserBalance,
        reserveId: selectedReserve.reserveId,
        tokenDecimals: selectedReserve.token.decimals,
      });
      if (params.kind === "error") {
        setRefetchError(params.message);
        return;
      }
      mode = params.mode;
      amount = params.amount;
      amountRaw = params.amountRaw;
    }

    setRefetchError(null);

    const success = await executeRepay(amount, selectedReserve, mode, {
      preSignValidation: () =>
        validateRepayPreSign({
          liquidationThresholdBps,
          refetchSplitParams,
        }),
      repayAmountRaw: amountRaw,
    });
    if (success) {
      resetRepayAmount();
      onRepaySuccess(amount, 0);
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
              balance: formatTokenAmount(maxRepayAmount, displayDecimals),
              symbol: assetConfig.symbol,
              displayUSD: false,
            }}
            sliderValue={repayAmount}
            sliderMin={0}
            sliderMax={sliderTrackMax}
            sliderStep={sliderTrackMax / SLIDER_STEP_COUNT}
            sliderSteps={[]}
            onSliderChange={setRepayAmountSlider}
            sliderVariant="rainbow"
            leftField={{
              label: "Max",
              value: `${formatTokenAmount(maxRepayAmount, displayDecimals)} ${assetConfig.symbol}`,
            }}
            onMaxClick={handleMaxClick}
            rightField={{
              value:
                tokenPriceUsd != null
                  ? formatUsdValue(repayAmount * tokenPriceUsd)
                  : "–",
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
        {!errorMessage && refetchError && (
          <p className="text-sm text-warning-main">{refetchError}</p>
        )}
        {!errorMessage && !refetchError && warningMessage && (
          <p className="text-sm text-warning-main">{warningMessage}</p>
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
