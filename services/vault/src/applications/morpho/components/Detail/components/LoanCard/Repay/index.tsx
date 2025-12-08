/**
 * Repay Tab Component
 * Handles the repay flow UI - repay debt and optionally withdraw collateral
 */

import { AmountSlider, Button } from "@babylonlabs-io/core-ui";

import { getCurrencyIconWithFallback } from "../../../../../../../services/token";
import { useMarketDetailContext } from "../../../context/MarketDetailContext";

import { RepaySummaryCard } from "./RepaySummaryCard";
import { useRepayState } from "./hooks/useRepayState";

export interface RepayProps {
  currentLoanAmount: number;
  currentCollateralAmount: number;
  btcPrice: number;
  liquidationLtv: number;
  onRepay: (repayAmount: number, withdrawCollateralAmount: number) => void;
  /** Processing state for button loading indicator */
  processing?: boolean;
}

export function Repay({
  currentLoanAmount,
  currentCollateralAmount,
  btcPrice,
  liquidationLtv,
  onRepay,
  processing = false,
}: RepayProps) {
  const { tokenPair } = useMarketDetailContext();

  const {
    repayAmount,
    withdrawCollateralAmount,
    setRepayAmount,
    setWithdrawCollateralAmount,
    canWithdrawCollateral,
    withdrawCollateralSteps,
    ltv,
    withdrawCollateralValueUSD,
  } = useRepayState({
    currentLoanAmount,
    currentCollateralAmount,
    btcPrice,
  });

  const isDisabled = repayAmount === 0 && withdrawCollateralAmount === 0;

  // Determine button text based on selected actions
  const hasRepay = repayAmount > 0;
  const hasWithdraw = withdrawCollateralAmount > 0;

  let buttonText: string;
  if (isDisabled) {
    buttonText = "Enter an amount";
  } else if (hasRepay && hasWithdraw) {
    buttonText = "Repay and Withdraw";
  } else if (hasRepay) {
    buttonText = "Repay";
  } else {
    buttonText = "Withdraw Collateral";
  }

  return (
    <div className="space-y-4">
      {/* Repay Section */}
      <div className="space-y-2">
        <h3 className="text-[24px] font-normal text-accent-primary">Repay</h3>
        <AmountSlider
          amount={repayAmount}
          currencyIcon={getCurrencyIconWithFallback(
            tokenPair.loan.icon,
            tokenPair.loan.symbol,
          )}
          currencyName={tokenPair.loan.name}
          onAmountChange={(e) =>
            setRepayAmount(parseFloat(e.target.value) || 0)
          }
          balanceDetails={{
            balance: currentLoanAmount.toLocaleString(),
            symbol: tokenPair.loan.symbol,
            displayUSD: false,
          }}
          sliderValue={repayAmount}
          sliderMin={0}
          sliderMax={currentLoanAmount}
          sliderStep={currentLoanAmount / 1000}
          onSliderChange={setRepayAmount}
          sliderVariant="primary"
          sliderActiveColor="#0B53BF"
          leftField={{
            label: "Max",
            value: `${currentLoanAmount.toLocaleString()} ${tokenPair.loan.symbol}`,
          }}
          onMaxClick={() => setRepayAmount(currentLoanAmount)}
          rightField={{
            value: `$${repayAmount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} USD`,
          }}
        />
      </div>

      {/* Withdraw Collateral Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[24px] font-normal text-accent-primary">
            Withdraw Collateral
          </h3>
          {!canWithdrawCollateral && (
            <span className="text-xs text-accent-secondary">
              Repay all debt to withdraw
            </span>
          )}
        </div>
        <AmountSlider
          amount={withdrawCollateralAmount}
          currencyIcon={getCurrencyIconWithFallback(
            tokenPair.collateral.icon,
            tokenPair.collateral.symbol,
          )}
          currencyName={tokenPair.collateral.name}
          disabled={!canWithdrawCollateral}
          balanceDetails={{
            balance: currentCollateralAmount.toFixed(4),
            symbol: tokenPair.collateral.symbol,
            displayUSD: false,
          }}
          sliderValue={withdrawCollateralAmount}
          sliderMin={0}
          sliderMax={currentCollateralAmount}
          sliderStep={currentCollateralAmount}
          sliderSteps={withdrawCollateralSteps}
          onSliderChange={setWithdrawCollateralAmount}
          onSliderStepsChange={() => {
            // Handle cumulative step selection here
          }}
          sliderVariant="primary"
          leftField={{
            label: "Max",
            value: `${currentCollateralAmount.toFixed(4)} ${tokenPair.collateral.symbol}`,
          }}
          onMaxClick={() =>
            setWithdrawCollateralAmount(currentCollateralAmount)
          }
          rightField={{
            value: `$${withdrawCollateralValueUSD.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} USD`,
          }}
        />
      </div>

      {/* Summary Card */}
      <RepaySummaryCard
        currentLoanAmount={currentLoanAmount}
        loanSymbol={tokenPair.loan.symbol}
        repayAmount={repayAmount}
        ltv={ltv}
        liquidationLtv={liquidationLtv}
      />

      {/* Action Button */}
      {/*
        Note: Parent component will detect if repayAmount === currentLoanAmount
        to determine full vs partial repayment (regardless of how user selected it)
      */}
      <Button
        variant="contained"
        color="primary"
        size="large"
        fluid
        disabled={isDisabled || processing}
        onClick={() => onRepay(repayAmount, withdrawCollateralAmount)}
      >
        {processing ? "Processing..." : buttonText}
      </Button>
    </div>
  );
}
