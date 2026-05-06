import { useLoanContext } from "@/applications/aave/components/context/LoanContext";
import { useBorrowMetrics } from "@/applications/aave/components/LoanCard/Borrow/hooks/useBorrowMetrics";
import { useBorrowState } from "@/applications/aave/components/LoanCard/Borrow/hooks/useBorrowState";
import { validateBorrowAction } from "@/applications/aave/components/LoanCard/Borrow/hooks/validateBorrowAction";
import {
  BPS_TO_PERCENT_DIVISOR,
  MIN_HEALTH_FACTOR_FOR_BORROW,
  MIN_SLIDER_MAX,
} from "@/applications/aave/constants";
import { useBorrowTransaction } from "@/applications/aave/hooks";
import type { AaveReserveConfig } from "@/applications/aave/services/fetchConfig";
import type { Asset } from "@/applications/aave/types";
import {
  aaveRayValueToUsd,
  aaveValueToUsd,
  calculateHealthFactor,
  getHealthFactorColor,
  getHealthFactorStatusFromValue,
  type HealthFactorColor,
} from "@/applications/aave/utils";
import { FeatureFlags } from "@/config";
import {
  getCurrencyIconWithFallback,
  getTokenBrandColor,
} from "@/services/token";
import { formatTokenAmount, formatUsdValue } from "@/utils/formatting";

export interface BorrowFormState {
  // Asset info
  assetSymbol: string;
  currencyIcon: string;
  tokenBrandColor: string;

  // Amount state
  borrowAmount: number;
  setBorrowAmount: (amount: number) => void;
  sliderMax: number;
  maxAmountFormatted: string;
  usdValueFormatted: string;

  // Validation
  isDisabled: boolean;
  buttonText: string;
  isProcessing: boolean;
  isBorrowDisabled: boolean;
  showLiquidationWarning: boolean;

  // Details card
  balanceFormatted: string;
  borrowRatio: string;
  borrowRatioOriginal?: string;
  healthFactor: string;
  healthFactorColor: HealthFactorColor;
  healthFactorOriginal?: string;
  healthFactorOriginalColor?: HealthFactorColor;
  healthFactorOriginalValue?: number;
  hasDebt: boolean;
  liquidationLtvFormatted: string;

  // Actions
  handleAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleMaxClick: () => void;
  handleBorrow: () => Promise<void>;
}

interface UseBorrowFormStateProps {
  onBorrowSuccess: (amount: number, symbol: string, icon: string) => void;
}

export function useBorrowFormState({
  onBorrowSuccess,
}: UseBorrowFormStateProps): BorrowFormState {
  const {
    collateralValueUsd,
    totalDebtValueUsd,
    healthFactor,
    liquidationThresholdBps,
    selectedReserve,
    assetConfig,
    tokenPriceUsd,
    isPositionDataStale,
    refetchPosition,
  } = useLoanContext();

  const { executeBorrow, isProcessing } = useBorrowTransaction();

  const { borrowAmount, setBorrowAmount, maxBorrowAmount } = useBorrowState({
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

  const { isDisabled, buttonText } = validateBorrowAction(
    borrowAmount,
    metrics.healthFactorValue,
    maxBorrowAmount,
    isPositionDataStale,
  );

  const sliderMax = Math.max(maxBorrowAmount, MIN_SLIDER_MAX);
  const hasDebt = totalDebtValueUsd > 0 || borrowAmount > 0;
  const liquidationLtv = liquidationThresholdBps / BPS_TO_PERCENT_DIVISOR;

  const healthFactorStatus = getHealthFactorStatusFromValue(
    metrics.healthFactorValue,
  );

  const originalStatus =
    metrics.healthFactorOriginalValue !== undefined
      ? getHealthFactorStatusFromValue(metrics.healthFactorOriginalValue)
      : undefined;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "" || value === ".") {
      setBorrowAmount(0);
      return;
    }
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      setBorrowAmount(parsed);
    }
  };

  const handleMaxClick = () => setBorrowAmount(sliderMax);

  const handleBorrow = async () => {
    const preSignValidation = async () => {
      if (tokenPriceUsd == null) {
        throw new Error("Token price unavailable. Cannot validate borrow.");
      }

      const freshPosition = await refetchPosition();
      if (!freshPosition) return;

      const freshCollateralUsd = aaveValueToUsd(
        freshPosition.accountData.totalCollateralValue,
      );
      const freshDebtUsd = aaveRayValueToUsd(
        freshPosition.accountData.totalDebtValueRay,
      );
      const projectedDebtUsd = freshDebtUsd + borrowAmount * tokenPriceUsd;
      const projectedHF = calculateHealthFactor(
        freshCollateralUsd,
        projectedDebtUsd,
        liquidationThresholdBps,
      );

      if (isFinite(projectedHF) && projectedHF < MIN_HEALTH_FACTOR_FOR_BORROW) {
        throw new Error(
          `Position data has changed. Projected health factor (${projectedHF.toFixed(2)}) ` +
            `would be below ${MIN_HEALTH_FACTOR_FOR_BORROW}. Please reduce the borrow amount.`,
        );
      }
    };

    const success = await executeBorrow(
      borrowAmount,
      selectedReserve as AaveReserveConfig,
      preSignValidation,
    );
    if (success) {
      onBorrowSuccess(
        borrowAmount,
        (assetConfig as Asset).symbol,
        (assetConfig as Asset).icon,
      );
    }
  };

  const resolvedButtonText = FeatureFlags.isBorrowDisabled
    ? "Borrowing Unavailable"
    : isProcessing
      ? "Processing..."
      : buttonText;

  return {
    assetSymbol: assetConfig.symbol,
    currencyIcon: getCurrencyIconWithFallback(
      assetConfig.icon,
      assetConfig.symbol,
    ),
    tokenBrandColor: getTokenBrandColor(assetConfig.symbol),

    borrowAmount,
    setBorrowAmount,
    sliderMax,
    maxAmountFormatted: `${formatTokenAmount(sliderMax)} ${assetConfig.symbol}`,
    usdValueFormatted:
      tokenPriceUsd != null
        ? formatUsdValue(borrowAmount * tokenPriceUsd)
        : "–",

    isDisabled,
    buttonText: resolvedButtonText,
    isProcessing,
    isBorrowDisabled: FeatureFlags.isBorrowDisabled,
    showLiquidationWarning:
      borrowAmount > 0 &&
      isFinite(metrics.healthFactorValue) &&
      metrics.healthFactorValue < MIN_HEALTH_FACTOR_FOR_BORROW,

    balanceFormatted: `${formatTokenAmount(collateralValueUsd, 2)} USD`,
    borrowRatio: metrics.borrowRatio,
    borrowRatioOriginal: metrics.borrowRatioOriginal,
    healthFactor: hasDebt ? metrics.healthFactor : "—",
    healthFactorColor: getHealthFactorColor(healthFactorStatus),
    healthFactorOriginal: metrics.healthFactorOriginal,
    healthFactorOriginalColor: originalStatus
      ? getHealthFactorColor(originalStatus)
      : undefined,
    healthFactorOriginalValue: metrics.healthFactorOriginalValue,
    hasDebt,
    liquidationLtvFormatted: hasDebt ? `${liquidationLtv.toFixed(1)}%` : "—",

    handleAmountChange,
    handleMaxClick,
    handleBorrow,
  };
}
