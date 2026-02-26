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
  isBorrowEnabled: boolean;
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
    positionId,
  } = useLoanContext();

  const { executeBorrow, isProcessing } = useBorrowTransaction({ positionId });

  const { borrowAmount, setBorrowAmount, maxBorrowAmount } = useBorrowState({
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

  const { isDisabled, buttonText } = validateBorrowAction(
    borrowAmount,
    metrics.healthFactorValue,
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
    const success = await executeBorrow(
      borrowAmount,
      selectedReserve as AaveReserveConfig,
    );
    if (success) {
      onBorrowSuccess(
        borrowAmount,
        (assetConfig as Asset).symbol,
        (assetConfig as Asset).icon,
      );
    }
  };

  const resolvedButtonText = !FeatureFlags.isBorrowEnabled
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
    usdValueFormatted: formatUsdValue(borrowAmount),

    isDisabled,
    buttonText: resolvedButtonText,
    isProcessing,
    isBorrowEnabled: FeatureFlags.isBorrowEnabled,
    showLiquidationWarning:
      borrowAmount > 0 &&
      metrics.healthFactorValue > 0 &&
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
