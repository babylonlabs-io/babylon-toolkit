/**
 * Borrow Tab Component
 * Handles the borrow flow UI - add collateral and borrow against it
 */

import { AmountSlider, Button, SubSection } from "@babylonlabs-io/core-ui";
import { useTheme } from "next-themes";

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
  const { theme } = useTheme();
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
    <div>
      <h3 className="mb-4 text-[24px] font-normal text-accent-primary">
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
          sliderActiveColor="#CE6533"
        />
      </SubSection>

      <h3 className="mb-4 mt-6 text-[24px] font-normal text-accent-primary">
        Borrow
      </h3>
      <div className="flex flex-col gap-2">
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
            sliderVariant={theme === "dark" ? "rainbow" : "primary"}
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
            sliderActiveColor="#0B53BF"
          />
        </SubSection>

        <LoanSummaryCard
          collateralAmount={collateralAmount}
          loanAmount={borrowAmount}
          ltv={ltv}
          liquidationLtv={liquidationLtv}
        />
      </div>

      <Button
        variant="contained"
        color="secondary"
        size="large"
        fluid
        disabled={isDisabled}
        onClick={() => onBorrow(collateralAmount, borrowAmount)}
        className="mt-6"
      >
        {getButtonText()}
      </Button>
    </div>
  );
}
