/**
 * Borrow Tab Component
 * Handles the borrow flow UI - add collateral and borrow against it
 */

import { AmountSlider, Button } from "@babylonlabs-io/core-ui";

import { LoanSummaryCard } from "../../LoanSummaryCard";

import type { AvailableVault } from "./hooks/useBorrowState";
import { useBorrowState } from "./hooks/useBorrowState";

export interface BorrowProps {
  btcPrice: number;
  liquidationLtv: number;
  onBorrow: (collateralAmount: number, borrowAmount: number) => void;
  /** Available vaults with status AVAILABLE (status 2) */
  availableVaults?: AvailableVault[];
}

export function Borrow({
  btcPrice,
  liquidationLtv,
  onBorrow,
  availableVaults,
}: BorrowProps) {
  const {
    collateralAmount,
    borrowAmount,
    setCollateralAmount,
    setBorrowAmount,
    collateralSteps,
    maxCollateralFromVaults,
    maxBorrowAmount,
    ltv,
    collateralValueUSD,
  } = useBorrowState({ btcPrice, liquidationLtv, availableVaults });

  const isDisabled = collateralAmount === 0 || borrowAmount === 0;

  return (
    <div className="space-y-4">
      {/* Collateral Section */}
      <div className="space-y-2">
        <h3 className="text-[24px] font-normal text-accent-primary">
          Collateral
        </h3>
        <AmountSlider
          amount={collateralAmount}
          currencyIcon="/images/btc.png"
          currencyName="Bitcoin"
          balanceDetails={{
            balance: maxCollateralFromVaults.toFixed(4),
            symbol: "BTC",
            displayUSD: false,
          }}
          sliderValue={collateralAmount}
          sliderMin={0}
          sliderMax={maxCollateralFromVaults}
          sliderStep={maxCollateralFromVaults / 1000}
          sliderSteps={collateralSteps}
          onSliderChange={setCollateralAmount}
          onSliderStepsChange={() => {
            // Handle cumulative step selection here
          }}
          sliderVariant="primary"
          leftField={{
            label: "Max",
            value: `${maxCollateralFromVaults.toFixed(4)} BTC`,
          }}
          onMaxClick={() => setCollateralAmount(maxCollateralFromVaults)}
          rightField={{
            value: `$${collateralValueUSD.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} USD`,
          }}
        />
      </div>

      {/* Borrow Section */}
      <div className="space-y-2">
        <h3 className="text-[24px] font-normal text-accent-primary">Borrow</h3>
        <AmountSlider
          amount={borrowAmount}
          currencyIcon="/images/usdc.png"
          currencyName="USDC"
          onAmountChange={(e) =>
            setBorrowAmount(parseFloat(e.target.value) || 0)
          }
          balanceDetails={{
            balance: maxBorrowAmount.toLocaleString(),
            symbol: "USDC",
            displayUSD: false,
          }}
          sliderValue={borrowAmount}
          sliderMin={0}
          sliderMax={maxBorrowAmount}
          sliderStep={maxBorrowAmount / 1000}
          onSliderChange={setBorrowAmount}
          sliderVariant="rainbow"
          leftField={{
            label: "Max",
            value: `${maxBorrowAmount.toLocaleString()} USDC`,
          }}
          onMaxClick={() => setBorrowAmount(maxBorrowAmount)}
          rightField={{
            value: `$${borrowAmount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} USD`,
          }}
        />
      </div>

      {/* Summary Card */}
      <LoanSummaryCard
        collateralAmount={collateralAmount}
        loanAmount={borrowAmount}
        ltv={ltv}
        liquidationLtv={liquidationLtv}
      />

      {/* Action Button */}
      <Button
        variant="contained"
        color="primary"
        size="large"
        fluid
        disabled={isDisabled}
        onClick={() => onBorrow(collateralAmount, borrowAmount)}
      >
        {isDisabled ? "Enter an amount" : "Borrow"}
      </Button>
    </div>
  );
}
