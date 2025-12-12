/**
 * Borrow Tab Component
 * Asset-selection-first flow without collateral section
 */

import { AmountSlider, Button, SubSection } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { getCurrencyIconWithFallback } from "../../../../../services/token";

import { BorrowDetailsCard } from "./BorrowDetailsCard";
import { useBorrowMetrics } from "./hooks/useBorrowMetrics";
import { useBorrowState } from "./hooks/useBorrowState";
import { useBorrowUI } from "./hooks/useBorrowUI";
import { BorrowSuccessModal } from "./SuccessModal";

export interface BorrowProps {
  btcPrice: number;
  liquidationLtv: number;
  onBorrow: (collateralAmount: number, borrowAmount: number) => void;
  onViewLoan: () => void;
  availableLiquidity: number;
  currentCollateralAmount: number;
  currentLoanAmount: number;
  processing?: boolean;
}

export function Borrow({
  btcPrice,
  liquidationLtv,
  onBorrow,
  onViewLoan,
  availableLiquidity,
  currentCollateralAmount,
  currentLoanAmount,
  processing = false,
}: BorrowProps) {
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

  const {
    borrowAmount,
    setBorrowAmount,
    maxBorrowAmount,
    borrowRate,
    selectedAsset,
  } = useBorrowState({
    btcPrice,
    liquidationLtv,
    availableLiquidity,
    currentCollateralAmount,
    currentLoanAmount,
  });

  const { isDisabled, buttonText } = useBorrowUI({
    borrowAmount,
  });

  const metrics = useBorrowMetrics({
    borrowAmount,
    borrowRate,
    btcPrice,
    currentCollateralAmount,
    currentLoanAmount,
    liquidationLtv,
  });

  const sliderMaxBorrow = Math.max(maxBorrowAmount, 0.0001);

  const handleBorrow = () => {
    // Call the onBorrow callback with 0 collateral (collateral already exists)
    onBorrow(0, borrowAmount);
    // Show success modal
    setIsSuccessModalOpen(true);
  };

  return (
    <div>
      {/* Borrow Amount Section */}
      <h3 className="mb-4 text-[24px] font-normal text-accent-primary">
        Borrow
      </h3>
      <div className="flex flex-col gap-2">
        <SubSection>
          <AmountSlider
            amount={borrowAmount}
            currencyIcon={getCurrencyIconWithFallback(
              selectedAsset.icon,
              selectedAsset.symbol,
            )}
            currencyName={selectedAsset.name}
            onAmountChange={(e) =>
              setBorrowAmount(parseFloat(e.target.value) || 0)
            }
            balanceDetails={{
              balance: sliderMaxBorrow.toLocaleString(),
              symbol: selectedAsset.symbol,
              displayUSD: false,
            }}
            sliderValue={borrowAmount}
            sliderMin={0}
            sliderMax={sliderMaxBorrow}
            sliderStep={sliderMaxBorrow / 1000}
            sliderSteps={[]}
            onSliderChange={setBorrowAmount}
            sliderVariant="primary"
            leftField={{
              label: "Max",
              value: `${sliderMaxBorrow.toLocaleString()} ${selectedAsset.symbol}`,
            }}
            onMaxClick={() => setBorrowAmount(sliderMaxBorrow)}
            rightField={{
              value: `$${borrowAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} USD`,
            }}
            sliderActiveColor="#0B53BF"
          />
        </SubSection>

        {/* Borrow Details Card */}
        <BorrowDetailsCard
          borrowRate={metrics.borrowRate}
          collateral={metrics.netCollateral}
          healthFactor={metrics.healthFactor}
          healthFactorOriginal={metrics.healthFactorOriginal}
        />
      </div>

      {/* Borrow Button */}
      <Button
        variant="contained"
        color="secondary"
        size="large"
        fluid
        disabled={isDisabled || processing}
        onClick={handleBorrow}
        className="mt-6"
      >
        {processing ? "Processing..." : buttonText}
      </Button>

      {/* Success Modal */}
      <BorrowSuccessModal
        open={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
        onViewLoan={onViewLoan}
        borrowAmount={borrowAmount}
        borrowSymbol={selectedAsset.symbol}
        assetIcon={selectedAsset.icon}
      />
    </div>
  );
}
