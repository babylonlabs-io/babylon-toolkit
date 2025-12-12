/**
 * Borrow metrics calculation hook
 * Calculates Net APY, Net balance, Net collateral, Risk premium, and Health factor
 */

export interface UseBorrowMetricsProps {
  borrowAmount: number;
  borrowRate: number;
  btcPrice: number;
  currentCollateralAmount: number;
  currentLoanAmount: number;
  liquidationLtv: number;
}

export interface UseBorrowMetricsResult {
  borrowRate: string;
  netApy: string;
  netApyOriginal?: string;
  netBalance: string;
  netBalanceOriginal?: string;
  netCollateral: string;
  netCollateralOriginal?: string;
  riskPremium: string;
  riskPremiumOriginal?: string;
  healthFactor: string;
  healthFactorValue: number;
  healthFactorOriginal?: string;
  healthFactorOriginalValue?: number;
}

export function useBorrowMetrics({
  borrowAmount,
  borrowRate,
  btcPrice,
  currentCollateralAmount,
  currentLoanAmount,
  liquidationLtv,
}: UseBorrowMetricsProps): UseBorrowMetricsResult {
  const borrowRateFormatted = `${borrowRate.toFixed(3)}%`;

  // Return dashes when no borrow amount
  if (borrowAmount === 0) {
    return {
      borrowRate: borrowRateFormatted,
      netApy: "-",
      netApyOriginal: undefined,
      netBalance: "-",
      netBalanceOriginal: undefined,
      netCollateral: "-",
      netCollateralOriginal: undefined,
      riskPremium: "-",
      riskPremiumOriginal: undefined,
      healthFactor: "-",
      healthFactorValue: 0,
      healthFactorOriginal: undefined,
      healthFactorOriginalValue: undefined,
    };
  }

  // Calculate metrics when borrow amount > 0
  const totalLoanAmount = currentLoanAmount + borrowAmount;
  const collateralValueUSD = currentCollateralAmount * btcPrice;

  // Original Net APY (before new borrow) - assume 0 if no current loan, else calculate based on current position
  const netApyOriginal =
    currentLoanAmount > 0 ? `-${borrowRate.toFixed(3)}%` : "0%";

  // Net APY
  const netApy = `-${borrowRate.toFixed(3)}%`;

  // Original Net balance = currentLoanAmount formatted as USD
  const netBalanceOriginal = `$${currentLoanAmount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  // Net balance = totalLoanAmount formatted as USD
  const netBalance = `$${totalLoanAmount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  // Original and New Net collateral = collateral value in USD
  const netCollateralOriginal = `$${collateralValueUSD.toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}`;

  const netCollateral = `$${collateralValueUSD.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  // Original Risk premium (before new borrow)
  const riskPremiumOriginal = "0%";

  const riskPremiumValue = 0;
  const riskPremium = `${riskPremiumValue.toFixed(3)}%`;

  // Calculate original health factor (before new borrow)
  const originalHealthFactorValue =
    currentLoanAmount > 0
      ? (collateralValueUSD * (liquidationLtv / 100)) / currentLoanAmount
      : 0;
  const healthFactorOriginal =
    originalHealthFactorValue > 0 ? originalHealthFactorValue.toFixed(2) : "-";

  // Health factor = (collateralValue * liquidationLTV) / totalLoanAmount
  const healthFactorValue =
    totalLoanAmount > 0
      ? (collateralValueUSD * (liquidationLtv / 100)) / totalLoanAmount
      : 0;
  const healthFactor =
    healthFactorValue > 0 ? healthFactorValue.toFixed(2) : "-";

  return {
    borrowRate: borrowRateFormatted,
    netApy,
    netApyOriginal,
    netBalance,
    netBalanceOriginal,
    netCollateral,
    netCollateralOriginal,
    riskPremium,
    riskPremiumOriginal,
    healthFactor,
    healthFactorValue,
    healthFactorOriginal,
    healthFactorOriginalValue: originalHealthFactorValue,
  };
}
