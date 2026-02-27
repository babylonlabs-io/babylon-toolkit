import { useLoanContext } from "@/applications/aave/components/context/LoanContext";
import { useRepayMetrics } from "@/applications/aave/components/LoanCard/Repay/hooks/useRepayMetrics";
import { useRepayState } from "@/applications/aave/components/LoanCard/Repay/hooks/useRepayState";
import { validateRepayAction } from "@/applications/aave/components/LoanCard/Repay/hooks/validateRepayAction";
import {
  BPS_TO_PERCENT_DIVISOR,
  MIN_SLIDER_MAX,
} from "@/applications/aave/constants";
import { useRepayTransaction } from "@/applications/aave/hooks";
import {
  getHealthFactorColor,
  getHealthFactorStatusFromValue,
  type HealthFactorColor,
} from "@/applications/aave/utils";
import { useETHWallet } from "@/context/wallet";
import { useERC20Balance } from "@/hooks/useERC20Balance";
import {
  getCurrencyIconWithFallback,
  getTokenBrandColor,
} from "@/services/token";
import {
  formatTokenAmount,
  formatUsdValue,
  parseAmountInput,
} from "@/utils/formatting";

export interface RepayFormState {
  // Asset info
  assetSymbol: string;
  currencyIcon: string;
  tokenBrandColor: string;

  // Amount state
  repayAmount: number;
  setRepayAmount: (amount: number) => void;
  sliderMax: number;
  maxAmountFormatted: string;
  usdValueFormatted: string;

  // Validation
  isDisabled: boolean;
  buttonText: string;
  isProcessing: boolean;
  errorMessage: string | null;

  // Details card
  balanceFormatted: string;
  borrowRatio: string;
  borrowRatioOriginal?: string;
  healthFactor: string;
  healthFactorColor: HealthFactorColor;
  healthFactorOriginal?: string;
  healthFactorOriginalColor?: HealthFactorColor;
  hasDebt: boolean;
  liquidationLtvFormatted: string;

  // Actions
  handleAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleMaxClick: () => void;
  handleRepay: () => Promise<void>;
}

interface UseRepayFormStateProps {
  onRepaySuccess: (amount: number, symbol: string, icon: string) => void;
}

export function useRepayFormState({
  onRepaySuccess,
}: UseRepayFormStateProps): RepayFormState {
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
  } = useLoanContext();

  const { address } = useETHWallet();

  const { balance: userTokenBalance } = useERC20Balance(
    selectedReserve.token.address,
    address,
    selectedReserve.token.decimals,
  );

  const { executeRepay, isProcessing } = useRepayTransaction({
    positionId,
    proxyContract,
  });

  const { repayAmount, setRepayAmount, maxRepayAmount, isFullRepayment } =
    useRepayState({
      currentDebtAmount,
      userTokenBalance,
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
    currentDebtAmount,
    userTokenBalance,
  );

  const sliderMax = Math.max(maxRepayAmount, MIN_SLIDER_MAX);
  const hasDebt = totalDebtValueUsd > 0;
  const liquidationLtv = liquidationThresholdBps / BPS_TO_PERCENT_DIVISOR;

  const healthFactorStatus = getHealthFactorStatusFromValue(
    metrics.healthFactorValue,
  );

  const originalStatus =
    metrics.healthFactorOriginalValue !== undefined
      ? getHealthFactorStatusFromValue(metrics.healthFactorOriginalValue)
      : undefined;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    parseAmountInput(e.target.value, setRepayAmount);
  };

  const handleMaxClick = () => setRepayAmount(sliderMax);

  const handleRepay = async () => {
    const success = await executeRepay(
      repayAmount,
      selectedReserve,
      isFullRepayment,
    );
    if (success) {
      onRepaySuccess(repayAmount, assetConfig.symbol, assetConfig.icon);
    }
  };

  const resolvedButtonText = isProcessing ? "Processing..." : buttonText;

  return {
    assetSymbol: assetConfig.symbol,
    currencyIcon: getCurrencyIconWithFallback(
      assetConfig.icon,
      assetConfig.symbol,
    ),
    tokenBrandColor: getTokenBrandColor(assetConfig.symbol),

    repayAmount,
    setRepayAmount,
    sliderMax,
    maxAmountFormatted: `${formatTokenAmount(sliderMax)} ${assetConfig.symbol}`,
    usdValueFormatted: formatUsdValue(repayAmount),

    isDisabled,
    buttonText: resolvedButtonText,
    isProcessing,
    errorMessage,

    balanceFormatted: `${formatTokenAmount(userTokenBalance)} ${assetConfig.symbol}`,
    borrowRatio: metrics.borrowRatio,
    borrowRatioOriginal: metrics.borrowRatioOriginal,
    healthFactor: hasDebt ? metrics.healthFactor : "—",
    healthFactorColor: getHealthFactorColor(healthFactorStatus),
    healthFactorOriginal: metrics.healthFactorOriginal,
    healthFactorOriginalColor: originalStatus
      ? getHealthFactorColor(originalStatus)
      : undefined,
    hasDebt,
    liquidationLtvFormatted: hasDebt ? `${liquidationLtv.toFixed(1)}%` : "—",

    handleAmountChange,
    handleMaxClick,
    handleRepay,
  };
}
