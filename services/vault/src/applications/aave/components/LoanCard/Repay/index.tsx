/**
 * Repay Tab Component
 *
 * Handles the complete repay flow including transaction execution.
 * Gets all required data from LoanContext.
 */

import {
  AmountSlider,
  Button,
  Callout,
  Heading,
  SubSection,
} from "@babylonlabs-io/core-ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import { isRepayBlocked } from "@/components/shared/protocolStatus";
import { useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { useERC20Balance } from "@/hooks";
import { useProtocolGateState } from "@/hooks/useProtocolGate";

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
  LOAN_TAB,
  MAX_BUTTON_CLASS_NAME,
  MIN_SLIDER_MAX,
  SAFE_TOFIXED_PRECISION,
  SLIDER_STEP_COUNT,
} from "../../../constants";
import { useAaveConfig } from "../../../context";
import {
  useAaveUserPosition,
  useRepayTransaction,
  type RepayMode,
} from "../../../hooks";
import { AssetPill } from "../../AssetPill";
import { useLoanContext } from "../../context/LoanContext";

import { pickRepayParams } from "./hooks/pickRepayParams";
import { useRepayMetrics } from "./hooks/useRepayMetrics";
import { useRepayState } from "./hooks/useRepayState";
import { validateRepayAction } from "./hooks/validateRepayAction";
import { validateRepayPreSign } from "./hooks/validateRepayPreSign";
import { RepayDetailsCard } from "./RepayDetailsCard";

export function Repay() {
  const gate = useProtocolGateState();
  const repayBlocked = isRepayBlocked(gate);
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
    isPriceStale,
    refetchPosition,
    refetchSplitParams,
    onRepaySuccess,
    onProcessingChange,
  } = useLoanContext();

  const { address } = useETHWallet();

  // Reserves the user can repay = those they currently hold debt in. Read from
  // the same position query the detail screen uses (React Query dedupes it).
  const { allBorrowReserves } = useAaveConfig();
  const { position } = useAaveUserPosition(address);
  const borrowedReserves = useMemo(
    () =>
      allBorrowReserves.filter((r) =>
        position?.debtPositions?.has(r.reserveId),
      ),
    [allBorrowReserves, position],
  );

  // Fetch user's token balance for repayment
  const {
    balance: userTokenBalance,
    error: balanceError,
    hasBalanceData,
    refetch: refetchUserBalance,
  } = useERC20Balance(
    selectedReserve.token.address,
    address,
    selectedReserve.token.decimals,
  );

  // "Known" = a balance has loaded at least once (`hasBalanceData`), NOT "the
  // latest fetch had no error". React Query keeps the last good balance across a
  // background-refetch error (refetchInterval 30s), so gating on `error == null`
  // would block repay on a transient blip despite a usable balance. The
  // Max-intent submit re-fetches fresh in `pickRepayParams`.
  const balanceKnown = hasBalanceData;

  const {
    executeRepay,
    isProcessing,
    error: txError,
    clearError,
  } = useRepayTransaction({
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

  const [refetchError, setRefetchError] = useState<string | null>(null);
  // Set the instant Repay is clicked so the button shows "Processing…" during
  // the Max-intent pre-submit refetch (pickRepayParams) — an on-chain
  // round-trip that runs before executeRepay's own `isProcessing` takes over.
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The form stays mounted when the asset switches (the AssetPill only changes
  // `:reserveId`), so clear the amount, the last failed-tx error and any stale
  // submit-time refetch error explicitly — all three belong to the previously
  // selected reserve and would otherwise carry over to a different debt.
  useEffect(() => {
    resetRepayAmount();
    clearError();
    setRefetchError(null);
  }, [selectedReserve.reserveId, resetRepayAmount, clearError]);

  // Mirror the in-flight state up to the detail screen so it can lock the
  // dialog's close affordances during signing — see AaveReserveDetail.
  useEffect(() => {
    onProcessingChange(isProcessing || isSubmitting);
  }, [isProcessing, isSubmitting, onProcessingChange]);

  const metrics = useRepayMetrics({
    repayAmount,
    currentDebtAmount,
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

  // Debt row strings (token units). The symbol is shown once, on the trailing
  // value, matching the design ("45,200 → 25,200 USDC"). When repaying, the
  // "before" value is the bare current debt and the "after" value carries the
  // symbol; with no amount entered there's no arrow and the current debt
  // carries the symbol itself.
  const debtCurrentValue = formatTokenAmount(
    metrics.debtCurrent,
    displayDecimals,
  );
  const debtProjectedLabel =
    metrics.debtProjected !== undefined
      ? `${formatTokenAmount(metrics.debtProjected, displayDecimals)} ${assetConfig.symbol}`
      : undefined;

  const { isDisabled, buttonText, errorMessage, warningMessage } =
    validateRepayAction(
      repayAmount,
      maxRepayAmount,
      currentDebtAmount,
      // Treat the balance as unknown until it's loaded so a loading/errored 0
      // isn't classified as a real zero balance — which would render the CTA as
      // "Insufficient balance" for a wallet that may actually hold tokens.
      balanceKnown ? userTokenBalance : undefined,
      displayDecimals,
      assetConfig.symbol,
    );

  // Cosmetic floor only: keeps the slider track from collapsing to zero
  // width when there's nothing to repay. Label + accept range use the real
  // `maxRepayAmount`.
  const sliderTrackMax = maxRepayAmount > 0 ? maxRepayAmount : MIN_SLIDER_MAX;

  // While the oracle price still belongs to the previously-selected reserve
  // (carried over to avoid a remount), withhold the price-derived USD value
  // rather than show a figure computed against the wrong reserve's price.
  const isPriceReady = tokenPriceUsd != null && !isPriceStale;

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
    // Flag pending immediately so the button gives feedback during the
    // Max-intent refetch below, not only once executeRepay sets isProcessing.
    setIsSubmitting(true);
    try {
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
    } finally {
      setIsSubmitting(false);
    }
  };

  // A single status callout, rendered once below the action button. Highest
  // priority first: a current input/validation error (only once the balance is
  // known, so we never surface a misleading verdict computed against a still-
  // loading 0), then the last failed transaction, the submit-time refetch
  // failure, a balance-load failure, and finally the standing shortfall warning.
  const statusCallout: {
    variant: "error" | "warning";
    title?: string;
    body: string;
  } | null =
    balanceKnown && errorMessage
      ? { variant: "error", title: buttonText, body: errorMessage }
      : txError
        ? {
            variant: "error",
            title: COPY.loans.transactionFailedTitle,
            body: txError,
          }
        : repayBlocked
          ? { variant: "warning", body: COPY.loans.repayingUnavailable }
          : refetchError
            ? { variant: "warning", body: refetchError }
            : // Only when NO balance ever loaded (first load failed). A
              // background-refetch blip keeps the last good balance, so it must
              // not surface a load error or block repay.
              !hasBalanceData && balanceError != null
              ? { variant: "warning", body: COPY.loans.repay.balanceLoadError }
              : balanceKnown && warningMessage
                ? { variant: "warning", body: warningMessage }
                : null;

  return (
    <div>
      {/* Repay Amount Section */}
      <Heading
        variant="h5"
        as="h3"
        className="mb-4 font-normal text-accent-primary"
      >
        Repay
      </Heading>
      <div className="flex flex-col gap-2">
        <SubSection className="!bg-secondary-highlight">
          <AmountSlider
            amount={repayAmount}
            disabled={isProcessing || isSubmitting}
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
                reserves={borrowedReserves}
                mode={LOAN_TAB.REPAY}
                disabled={isProcessing || isSubmitting}
              />
            }
            onAmountChange={(e) => {
              // Clear a stale submit-time refetch error so it can't outrank the
              // current validation message once the user edits the amount.
              setRefetchError(null);
              setRepayAmount(parseFloat(e.target.value) || 0);
            }}
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
            sliderDisabled={!balanceKnown || maxRepayAmount <= 0}
            onSliderChange={(value) => {
              setRefetchError(null);
              setRepayAmountSlider(value);
            }}
            sliderVariant="primary"
            leftField={{
              value:
                repayAmount === 0
                  ? COPY.common.zeroUsdValue
                  : isPriceReady
                    ? formatUsdValue(repayAmount * (tokenPriceUsd as number))
                    : COPY.common.emptyValue,
            }}
            onMaxClick={handleMaxClick}
            rightField={{
              // Show the user's full wallet balance beside Max. Max still snaps
              // to `maxRepayAmount` (= min(debt, balance)), i.e. it tops out at
              // the debt rather than the whole balance. Gate on `balanceKnown`
              // so a loading/errored 0 isn't shown as a real balance.
              label: COPY.loans.balanceLabel,
              value: balanceKnown
                ? `${formatTokenAmount(userTokenBalance, displayDecimals)} ${assetConfig.symbol}`
                : COPY.common.emptyValue,
            }}
            maxPosition="right"
            maxButtonClassName={MAX_BUTTON_CLASS_NAME}
            sliderActiveColor={getTokenBrandColor(assetConfig.symbol)}
            inputClassName={AMOUNT_INPUT_CLASS_NAME}
          />
        </SubSection>

        <RepayDetailsCard
          debt={
            debtProjectedLabel ?? `${debtCurrentValue} ${assetConfig.symbol}`
          }
          debtOriginal={debtProjectedLabel ? debtCurrentValue : undefined}
          healthFactor={metrics.healthFactor}
          healthFactorValue={metrics.healthFactorValue}
          healthFactorOriginal={metrics.healthFactorOriginal}
          healthFactorOriginalValue={metrics.healthFactorOriginalValue}
        />
      </div>

      {/* Repay Button */}
      <Button
        variant="contained"
        color="secondary"
        size="large"
        fluid
        disabled={
          isDisabled ||
          isProcessing ||
          isSubmitting ||
          !balanceKnown ||
          repayBlocked
        }
        onClick={handleRepay}
        className="mt-6"
      >
        {repayBlocked
          ? COPY.loans.repay.unavailable
          : isProcessing || isSubmitting
            ? COPY.loans.repay.processing
            : buttonText}
      </Button>

      {/* Single status callout (validation / transaction / balance warning) */}
      {statusCallout && (
        <Callout
          variant={statusCallout.variant}
          title={statusCallout.title}
          className="mt-4"
        >
          {statusCallout.body}
        </Callout>
      )}
    </div>
  );
}
