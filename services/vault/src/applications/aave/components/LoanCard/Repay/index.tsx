/**
 * Repay Tab Component
 *
 * Handles the complete repay flow including transaction execution.
 * Gets all required data from LoanContext.
 */

import { AmountSlider, Button, SubSection } from "@babylonlabs-io/core-ui";
import { useCallback, useState } from "react";
import { formatUnits } from "viem";

import { useETHWallet } from "@/context/wallet";
import { useERC20Balance } from "@/hooks";
import { logger } from "@/infrastructure";

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
  FULL_REPAY_BUFFER_FRACTION,
  MIN_SLIDER_MAX,
} from "../../../constants";
import { useRepayTransaction } from "../../../hooks";
import { useLoanContext } from "../../context/LoanContext";
import { BorrowDetailsCard } from "../Borrow/BorrowDetailsCard";

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
    repayAmountRaw,
    setRepayAmount,
    setRepayAmountWithMode,
    resetRepayAmount,
    maxRepayAmount,
    repayMode,
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

  const { isDisabled, buttonText, errorMessage, warningMessage } =
    validateRepayAction(
      repayAmount,
      maxRepayAmount,
      currentDebtAmount,
      userTokenBalance,
    );

  // Cosmetic floor only: keeps the slider track from collapsing to zero
  // width when there's nothing to repay. Label + accept range use the real
  // `maxRepayAmount`.
  const sliderTrackMax = maxRepayAmount > 0 ? maxRepayAmount : MIN_SLIDER_MAX;

  const [maxClickError, setMaxClickError] = useState<string | null>(null);

  // Refetch fresh debt + balance before picking the repay mode. Stale values
  // can land us in the wrong branch (e.g. `max-capped` without a raw bigint
  // → broken float round-trip), so on any read failure we surface an error
  // and bail rather than silently use cached values.
  const handleMaxClick = useCallback(async () => {
    setMaxClickError(null);

    // React Query's default networkMode pauses queries when offline rather
    // than throwing, so the try/catch alone would silently use stale data.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setMaxClickError("Couldn't refresh balance/debt — please try again.");
      return;
    }

    let freshDebtAmount: number;
    let freshBalanceAmount: number;
    let freshBalanceRaw: bigint;

    try {
      const [freshPosition, freshBalanceResult] = await Promise.all([
        refetchPosition(),
        refetchUserBalance(),
      ]);

      // React Query refetches don't reject on queryFn error — they surface
      // it on the result. Treat as a failure here.
      if (freshBalanceResult.isError) {
        throw freshBalanceResult.error ?? new Error("Balance refetch failed");
      }

      const freshDebtRaw =
        freshPosition?.debtPositions?.get(selectedReserve.reserveId)
          ?.totalDebt ?? 0n;
      freshDebtAmount = Number(
        formatUnits(freshDebtRaw, selectedReserve.token.decimals),
      );
      freshBalanceRaw = freshBalanceResult.data ?? 0n;
      freshBalanceAmount = Number(
        formatUnits(freshBalanceRaw, selectedReserve.token.decimals),
      );
    } catch (error) {
      logger.warn("Max click refetch failed", {
        data: {
          context: "Aave repay Max click",
          error: error instanceof Error ? error.message : String(error),
        },
      });
      setMaxClickError("Couldn't refresh balance/debt — please try again.");
      return;
    }

    if (freshDebtAmount <= 0 || freshBalanceAmount <= 0) {
      setRepayAmountWithMode(
        Math.min(freshDebtAmount, freshBalanceAmount),
        "partial",
      );
      return;
    }

    const fullRepayThreshold =
      freshDebtAmount * (1 + FULL_REPAY_BUFFER_FRACTION);

    if (freshBalanceAmount >= fullRepayThreshold) {
      setRepayAmountWithMode(freshDebtAmount, "full");
    } else if (freshBalanceAmount >= freshDebtAmount) {
      // Pass the raw bigint so the parseUnits round-trip in useRepayTransaction
      // can't round up by 1 ULP and produce an approval > balance.
      setRepayAmountWithMode(freshBalanceAmount, "max-capped", freshBalanceRaw);
    } else {
      setRepayAmountWithMode(freshBalanceAmount, "partial");
    }
  }, [
    refetchPosition,
    refetchUserBalance,
    selectedReserve.reserveId,
    selectedReserve.token.decimals,
    setRepayAmountWithMode,
  ]);

  const handleRepay = async () => {
    const success = await executeRepay(
      repayAmount,
      selectedReserve,
      repayMode,
      {
        preSignValidation: () =>
          validateRepayPreSign({
            liquidationThresholdBps,
            refetchSplitParams,
          }),
        repayAmountRaw,
      },
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
              balance: formatTokenAmount(maxRepayAmount),
              symbol: assetConfig.symbol,
              displayUSD: false,
            }}
            sliderValue={repayAmount}
            sliderMin={0}
            sliderMax={sliderTrackMax}
            sliderStep={sliderTrackMax / 1000}
            sliderSteps={[]}
            onSliderChange={setRepayAmount}
            sliderVariant="rainbow"
            leftField={{
              label: "Max",
              value: `${formatTokenAmount(maxRepayAmount)} ${assetConfig.symbol}`,
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
        {!errorMessage && maxClickError && (
          <p className="text-sm text-warning-main">{maxClickError}</p>
        )}
        {!errorMessage && !maxClickError && warningMessage && (
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
