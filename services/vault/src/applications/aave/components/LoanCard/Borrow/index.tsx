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
  Heading,
  SubSection,
  Text,
  WarningIcon,
} from "@babylonlabs-io/core-ui";
import { useEffect, useMemo } from "react";

import { getHealthFactorStatusFromValue } from "@/applications/aave/utils";
import { isBorrowBlocked } from "@/components/shared/protocolStatus";
import { useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";

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
  useAaveReserveDrawHeadroom,
  useAaveReserveLiquidity,
  useBorrowTransaction,
  useDebtReserves,
  useHubSpokeConfigs,
  useProjectedBorrowApr,
} from "../../../hooks";
import { describeHubBlock, getBorrowHubBlock } from "../../../utils/hubState";
import { AssetPill } from "../../AssetPill";
import { useLoanContext } from "../../context/LoanContext";

import { BorrowMetricsCard } from "./BorrowMetricsCard";
import { useBorrowMetrics } from "./hooks/useBorrowMetrics";
import { useBorrowState } from "./hooks/useBorrowState";
import {
  getBorrowLimit,
  validateBorrowAction,
} from "./hooks/validateBorrowAction";
import { validateBorrowPreSign } from "./hooks/validateBorrowPreSign";

/**
 * Borrow at most this fraction of a reserve's available liquidity, and of what
 * the hub's borrow limit leaves. The small margin keeps "Max" from advertising
 * the exact remaining amount, since borrowing the reserve down to zero can
 * revert under some pool configs. It does not cover interest: that accrues on
 * everything our spoke owes on the hub, so a large debt can use up more of the
 * borrow limit between the read and the transaction than this margin leaves.
 * The on-chain draw is the backstop, and its decoded `DrawCapExceeded` names
 * the limit.
 */
const MAX_BORROWABLE_FRACTION = 0.999;

export function Borrow() {
  const gate = useProtocolGateState();
  const {
    collateralValueUsd,
    totalDebtValueUsd,
    healthFactor,
    liquidationThresholdBps,
    selectedReserve,
    tokenIdentity,
    assetConfig,
    hub,
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
      tokenDecimals: tokenIdentity.decimals,
    });

  // One stable array for the per-reserve reads below.
  const selectedReserves = useMemo(() => [selectedReserve], [selectedReserve]);

  // Live available liquidity for the selected reserve (Aave Hub reserve totals);
  // also drives the metrics card below. Falls back to "–" while loading/failed.
  const { liquidityByReserveId } = useAaveReserveLiquidity({
    reserves: selectedReserves,
  });
  const reserveLiquidity =
    liquidityByReserveId[selectedReserve.reserveId.toString()];

  // What our spoke may still draw on this reserve's hub (its borrow limit),
  // separate from the hub's liquidity, which every spoke on the hub shares.
  const { headroomByReserveId } = useAaveReserveDrawHeadroom({
    reserves: selectedReserves,
  });
  const drawHeadroom =
    headroomByReserveId[selectedReserve.reserveId.toString()] ?? null;

  // You can't borrow more than the reserve holds or than the hub's borrow limit
  // leaves, so cap the collateral-based max by both (less a safety margin) when
  // known. Additive: a loading or failed read skips its cap, so a best-effort
  // display read can never block an otherwise-fundable borrow.
  const { max: effectiveMaxBorrowAmount, limitedBy } = getBorrowLimit(
    maxBorrowAmount,
    reserveLiquidity == null
      ? Infinity
      : reserveLiquidity.availableLiquidity * MAX_BORROWABLE_FRACTION,
    drawHeadroom == null ? Infinity : drawHeadroom * MAX_BORROWABLE_FRACTION,
  );

  // A hub that would reject this borrow: the reserve's own hub halted or
  // inactive, or an inactive hub where the user has debt. Read live, so a hub
  // that recovers unblocks the form without a reload.
  const { address } = useETHWallet();
  const debtReserves = useDebtReserves(address);
  const hubReserves = useMemo(
    () => [selectedReserve, ...debtReserves],
    [selectedReserve, debtReserves],
  );
  const hubSpokeConfigs = useHubSpokeConfigs(hubReserves);
  const { borrowableReserves } = useAaveConfig();
  const hubBlock = getBorrowHubBlock(
    selectedReserve,
    debtReserves,
    hubSpokeConfigs,
  );
  const hubBlockMessage = hubBlock ? describeHubBlock(hubBlock) : null;
  const isBorrowUnavailable = isBorrowBlocked(gate) || hubBlock !== null;

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
    tokenIdentity.decimals,
    assetConfig.symbol,
    hub.label,
    isPositionDataStale,
    limitedBy,
  );

  // Cosmetic minimum only — keeps the slider track from rendering at zero
  // width when there is nothing to borrow. The "Max" label and the slider's
  // accept range use `effectiveMaxBorrowAmount` so the UI doesn't advertise a
  // value (beyond collateral capacity, available liquidity or the hub's borrow
  // limit) that validation will reject.
  const sliderTrackMax =
    effectiveMaxBorrowAmount > 0 ? effectiveMaxBorrowAmount : MIN_SLIDER_MAX;
  const displayDecimals = Math.min(
    tokenIdentity.decimals,
    SAFE_TOFIXED_PRECISION,
  );

  const hasProjection = borrowAmount > 0;

  // Current and projected borrow APR for the selected reserve, both evaluated
  // from the Hub asset's on-chain interest-rate strategy so the entered amount's
  // effect on utilization is exact. The projected figure is shown only once an
  // amount raises the rate enough to differ from the current after formatting.
  const { currentPercent: borrowAprPercent, projectedPercent } =
    useProjectedBorrowApr({ reserve: selectedReserve, borrowAmount });
  const borrowAprDisplay =
    borrowAprPercent == null
      ? COPY.common.emptyValue
      : formatAprPercent(borrowAprPercent);
  const borrowAprProjectedDisplay =
    hasProjection && borrowAprPercent != null && projectedPercent != null
      ? formatAprPercent(projectedPercent)
      : undefined;
  // Suppress the arrow when the projection rounds to the current value (e.g.
  // a tiny amount, or the debounced amount has not yet caught up to the input).
  const borrowAprProjected =
    borrowAprProjectedDisplay && borrowAprProjectedDisplay !== borrowAprDisplay
      ? borrowAprProjectedDisplay
      : undefined;

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
    (projectedHealthStatus === "risky" || projectedHealthStatus === "danger");

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
    if (isBorrowUnavailable) return COPY.loans.borrow.unavailable;
    if (isProcessing) return COPY.loans.borrow.processing;
    return buttonText;
  };

  // A single status callout, rendered once below the action button. Highest
  // priority first: why borrowing is unavailable (so it matches the button),
  // then a current input/validation error, then the last failed transaction,
  // then the standing warnings.
  const statusCallout: {
    variant: "error" | "warning";
    title?: string;
    body: string;
  } | null = isBorrowBlocked(gate)
    ? { variant: "warning", body: COPY.loans.borrowingUnavailable }
    : hubBlockMessage
      ? { variant: "warning", body: hubBlockMessage }
      : errorMessage
        ? { variant: "error", title: buttonText, body: errorMessage }
        : txError
          ? {
              variant: "error",
              title: COPY.common.transactionFailedTitle,
              body: txError,
            }
          : tokenPriceUsd == null || oracleAddress == null
            ? { variant: "warning", body: COPY.loans.priceUnavailable }
            : // Before an amount is entered, say the borrow limit is used up
              // rather than leaving a zero max unexplained.
              limitedBy === "borrowLimit" && effectiveMaxBorrowAmount <= 0
              ? {
                  variant: "warning",
                  body: COPY.loans.validation.borrowLimitReached(
                    assetConfig.symbol,
                    hub.label,
                  ),
                }
              : null;

  return (
    <div>
      {/* Borrow Amount Section */}
      <Heading
        variant="h5"
        as="h3"
        className="mb-4 font-normal text-accent-primary"
      >
        {COPY.loans.borrow.action}
      </Heading>
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
                selectedReserveId={selectedReserve.reserveId}
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
          hub={hub}
          availableLiquidity={availableLiquidityDisplay}
          availableLiquidityProjected={availableLiquidityProjectedDisplay}
          borrowApr={borrowAprDisplay}
          borrowAprProjected={borrowAprProjected}
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
          isBorrowUnavailable ||
          !isPriceReady ||
          oracleAddress == null
        }
        onClick={handleBorrow}
        className="mt-2 disabled:!bg-accent-disabled disabled:!opacity-100"
        data-testid="borrow-submit-button"
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
    </div>
  );
}
