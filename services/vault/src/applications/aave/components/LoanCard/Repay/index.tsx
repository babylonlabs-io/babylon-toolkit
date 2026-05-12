/**
 * Repay Tab Component
 *
 * Handles the complete repay flow including transaction execution.
 * Gets all required data from LoanContext.
 */

import { AmountSlider, Button, SubSection } from "@babylonlabs-io/core-ui";
import { useCallback } from "react";
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

  const sliderMaxRepay = Math.max(maxRepayAmount, MIN_SLIDER_MAX);

  // Max click: refresh debt and balance from chain so we don't decide the
  // repay path on stale React Query data (up to 30s old). Then pick the
  // cheapest path that actually clears the debt:
  //
  // - balance ≥ debt × (1 + buffer)   → "full" (repayFull adds the buffer)
  // - debt ≤ balance < debt × (1+buf) → "max-capped" (send full balance;
  //                                      adapter pulls min(balance, debt))
  // - balance < debt                  → partial Max; validateRepayAction
  //                                      will surface a "need more tokens"
  //                                      message and keep submit disabled
  //                                      for amount > maxRepayAmount.
  //
  // If either refetch fails (RPC blip, timeout), fall back to the cached
  // context values rather than letting the click be a silent no-op.
  // useRepayTransaction does its own on-chain checks at broadcast, so the
  // user still gets a correct tx; they just don't get the freshest mode
  // decision.
  const handleMaxClick = useCallback(async () => {
    let freshDebtAmount = currentDebtAmount;
    let freshBalanceAmount = userTokenBalance;
    let freshBalanceRaw: bigint | undefined;

    try {
      const [freshPosition, freshBalanceResult] = await Promise.all([
        refetchPosition(),
        refetchUserBalance(),
      ]);

      const freshDebtRaw =
        freshPosition?.debtPositions?.get(selectedReserve.reserveId)
          ?.totalDebt ?? 0n;
      freshDebtAmount = Number(
        formatUnits(freshDebtRaw, selectedReserve.token.decimals),
      );
      freshBalanceRaw = freshBalanceResult?.data ?? 0n;
      freshBalanceAmount = Number(
        formatUnits(freshBalanceRaw, selectedReserve.token.decimals),
      );
    } catch (error) {
      logger.warn("Max click refetch failed; using cached debt/balance", {
        data: {
          context: "Aave repay Max click",
          error: error instanceof Error ? error.message : String(error),
        },
      });
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
      // Pass the raw bigint cap so the float round-trip in useRepayTransaction
      // can never produce an approval amount > the user's actual balance.
      // For ≥16-significant-digit raw balances (any 18-decimal token with > ~10
      // tokens in the wallet) the round-trip can round up by 1 ULP, which
      // would revert the tx. Sending the bigint sidesteps the conversion.
      setRepayAmountWithMode(freshBalanceAmount, "max-capped", freshBalanceRaw);
    } else {
      setRepayAmountWithMode(freshBalanceAmount, "partial");
    }
  }, [
    currentDebtAmount,
    userTokenBalance,
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
              balance: formatTokenAmount(sliderMaxRepay),
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
              value: `${formatTokenAmount(sliderMaxRepay)} ${assetConfig.symbol}`,
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
        {!errorMessage && warningMessage && (
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
