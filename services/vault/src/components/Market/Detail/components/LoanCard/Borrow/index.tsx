/**
 * Borrow Tab Component
 * Handles the borrow flow UI - add collateral and borrow against it
 */

import { AmountSlider, Button, SubSection } from "@babylonlabs-io/core-ui";
import { useTheme } from "next-themes";

import { getCurrencyIconWithFallback } from "../../../../../../services/token";
import { useMarketDetailContext } from "../../../context/MarketDetailContext";

import { LoanSummaryCard } from "./LoanSummaryCard";
import type { AvailableVault } from "./hooks/useBorrowState";
import { useBorrowState } from "./hooks/useBorrowState";
import { useBorrowUI } from "./hooks/useBorrowUI";

export interface BorrowProps {
  btcPrice: number;
  liquidationLtv: number;
  onBorrow: (collateralAmount: number, borrowAmount: number) => void;
  /** Available vaults with status AVAILABLE (status 2) */
  availableVaults?: AvailableVault[];
  /** Available liquidity in the market (in USDC) */
  availableLiquidity: number;
  /** Current collateral amount in position (BTC) */
  currentCollateralAmount: number;
  /** Current loan amount in position (USDC) */
  currentLoanAmount: number;
}

export function Borrow({
  btcPrice,
  liquidationLtv,
  onBorrow,
  availableVaults,
  availableLiquidity,
  currentCollateralAmount,
  currentLoanAmount,
}: BorrowProps) {
  const { theme } = useTheme();
  const { tokenPair } = useMarketDetailContext();

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
  } = useBorrowState({
    btcPrice,
    liquidationLtv,
    availableVaults,
    currentCollateralAmount,
    currentLoanAmount,
  });

  const { isDisabled, buttonText } = useBorrowUI({
    collateralAmount,
    borrowAmount,
    currentCollateralAmount,
    availableLiquidity,
  });

  return (
    <div>
      <h3 className="mb-4 text-[24px] font-normal text-accent-primary">
        Collateral
      </h3>
      <SubSection>
        <AmountSlider
          amount={collateralAmount}
          currencyIcon={getCurrencyIconWithFallback(
            tokenPair?.collateral.icon,
            tokenPair?.collateral.symbol || "BTC",
          )}
          currencyName={tokenPair?.collateral.name || "Collateral"}
          balanceDetails={{
            balance: maxCollateralFromVaults.toFixed(4),
            symbol: tokenPair?.collateral.symbol || "BTC",
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
            value: `${maxCollateralFromVaults.toFixed(4)} ${tokenPair?.collateral.symbol || "BTC"}`,
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
            currencyIcon={getCurrencyIconWithFallback(
              tokenPair?.loan.icon,
              tokenPair?.loan.symbol || "USDC",
            )}
            currencyName={tokenPair?.loan.name || "Loan Token"}
            onAmountChange={(e) =>
              setBorrowAmount(parseFloat(e.target.value) || 0)
            }
            balanceDetails={{
              balance: maxBorrowAmount.toLocaleString(),
              symbol: tokenPair?.loan.symbol || "USDC",
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
              value: `${maxBorrowAmount.toLocaleString()} ${tokenPair?.loan.symbol || "USDC"}`,
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
          collateralAmount={currentCollateralAmount + collateralAmount}
          collateralSymbol={tokenPair?.collateral.symbol || "BTC"}
          loanAmount={currentLoanAmount + borrowAmount}
          loanSymbol={tokenPair?.loan.symbol || "USDC"}
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
        {buttonText}
      </Button>
    </div>
  );
}
