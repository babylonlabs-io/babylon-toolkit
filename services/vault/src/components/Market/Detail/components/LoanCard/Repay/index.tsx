/**
 * Repay Tab Component
 * Handles the repay flow UI - repay debt and optionally withdraw collateral
 */

import { AmountSlider, Button } from "@babylonlabs-io/core-ui";

import { RepaySummaryCard } from "./RepaySummaryCard";
import { useRepayState } from "./hooks/useRepayState";

export interface RepayProps {
  currentLoanAmount: number;
  currentCollateralAmount: number;
  btcPrice: number;
  liquidationLtv: number;
  onRepay: (repayAmount: number, withdrawCollateralAmount: number) => void;
}

export function Repay({
  currentLoanAmount,
  currentCollateralAmount,
  btcPrice,
  liquidationLtv,
  onRepay,
}: RepayProps) {
  const {
    repayAmount,
    withdrawCollateralAmount,
    setRepayAmount,
    setWithdrawCollateralAmount,
    withdrawCollateralSteps,
    ltv,
    withdrawCollateralValueUSD,
  } = useRepayState({ currentLoanAmount, currentCollateralAmount, btcPrice });

  const isDisabled = repayAmount === 0 && withdrawCollateralAmount === 0;

  return (
    <div className="space-y-4">
      {/* Repay Section */}
      <div className="space-y-2">
        <h3 className="text-[24px] font-normal text-accent-primary">Repay</h3>
        <AmountSlider
          amount={repayAmount}
          currencyIcon="/images/usdc.png"
          currencyName="USDC"
          onAmountChange={(e) =>
            setRepayAmount(parseFloat(e.target.value) || 0)
          }
          balanceDetails={{
            balance: currentLoanAmount.toLocaleString(),
            symbol: "USDC",
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
            value: `${currentLoanAmount.toLocaleString()} USDC`,
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
        <h3 className="text-[24px] font-normal text-accent-primary">
          Withdraw Collateral
        </h3>
        <AmountSlider
          amount={withdrawCollateralAmount}
          currencyIcon="/images/btc.png"
          currencyName="Bitcoin"
          balanceDetails={{
            balance: currentCollateralAmount.toFixed(4),
            symbol: "BTC",
            displayUSD: false,
          }}
          sliderValue={withdrawCollateralAmount}
          sliderMin={0}
          sliderMax={currentCollateralAmount}
          sliderStep={currentCollateralAmount / 1000}
          sliderSteps={withdrawCollateralSteps}
          onSliderChange={setWithdrawCollateralAmount}
          onSliderStepsChange={() => {
            // Handle cumulative step selection here
          }}
          sliderVariant="primary"
          leftField={{
            label: "Max",
            value: `${currentCollateralAmount.toFixed(4)} BTC`,
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
        disabled={isDisabled}
        onClick={() => onRepay(repayAmount, withdrawCollateralAmount)}
      >
        {isDisabled ? "Enter an amount" : "Repay and Withdraw"}
      </Button>
    </div>
  );
}
