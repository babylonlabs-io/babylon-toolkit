/**
 * Borrow Tab Component
 * Handles the borrow flow UI - add collateral and borrow against it
 */

import { AmountSlider, Button, SubSection } from "@babylonlabs-io/core-ui";

import { LoanSummaryCard } from "../../LoanSummaryCard";

import type { AvailableVault } from "./hooks/useBorrowState";
import { useBorrowState } from "./hooks/useBorrowState";

export interface BorrowProps {
  btcPrice: number;
  liquidationLtv: number;
  onBorrow: (collateralAmount: number, borrowAmount: number) => void;
  /** Available vaults with status AVAILABLE (status 2) */
  availableVaults?: AvailableVault[];
  /** Available liquidity in the market (in USDC) */
  availableLiquidity: number;
}

export function Borrow({
  btcPrice,
  liquidationLtv,
  onBorrow,
  availableVaults,
  availableLiquidity,
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

  const hasInsufficientLiquidity = borrowAmount > availableLiquidity;
  const isDisabled =
    collateralAmount === 0 || borrowAmount === 0 || hasInsufficientLiquidity;

  // Determine button text based on state
  const getButtonText = () => {
    if (hasInsufficientLiquidity) {
      return `Insufficient liquidity (${availableLiquidity.toLocaleString()} USDC available)`;
    }
    if (collateralAmount === 0 || borrowAmount === 0) {
      return "Enter an amount";
    }
    return "Borrow";
  };

  return (
    <div className="space-y-4">
      {/* Collateral Section */}
      <div className="space-y-2">
        <h3 className="text-[24px] font-normal text-accent-primary">
          Collateral
        </h3>
        <SubSection>
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
        </SubSection>
      </div>

      {/* Borrow Section */}
      <div className="space-y-2">
        <h3 className="text-[24px] font-normal text-accent-primary">Borrow</h3>
        <SubSection>
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
        </SubSection>
      </div>

      <LoanSummaryCard
        collateralAmount={collateralAmount}
        loanAmount={borrowAmount}
        ltv={ltv}
        liquidationLtv={liquidationLtv}
      />

      <Button
        variant="contained"
        color="primary"
        size="large"
        fluid
        disabled={isDisabled}
        onClick={() => onBorrow(collateralAmount, borrowAmount)}
      >
        {getButtonText()}
      </Button>
    </div>
  );
}
