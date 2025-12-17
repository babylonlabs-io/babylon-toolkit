/**
 * Borrow Tab Component
 *
 * Displays borrow slider and handles borrow flow.
 * Asset is selected before landing on this page (from route).
 */

import { AmountSlider, Button, SubSection } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { getCurrencyIconWithFallback } from "../../../../../services/token";
import { MIN_SLIDER_MAX } from "../../../constants";
import type { Asset } from "../../../types";

import { BorrowDetailsCard } from "./BorrowDetailsCard";
import { useBorrowMetrics } from "./hooks/useBorrowMetrics";
import { useBorrowState } from "./hooks/useBorrowState";
import { validateBorrowAction } from "./hooks/validateBorrowAction";
import { BorrowSuccessModal } from "./SuccessModal";

export interface BorrowProps {
  /** Collateral value in USD (from Aave oracle) */
  collateralValueUsd: number;
  /** Current debt in USD (from Aave oracle) */
  currentDebtUsd: number;
  /** vBTC liquidation threshold in BPS (e.g., 8000 = 80%) */
  liquidationThresholdBps: number;
  /** Current health factor (null if no debt) */
  currentHealthFactor: number | null;
  /** Selected asset to borrow (from route) */
  selectedAsset: Asset;
  onBorrow: (collateralAmount: number, borrowAmount: number) => void;
  onViewLoan: () => void;
  processing?: boolean;
}

export function Borrow({
  collateralValueUsd,
  currentDebtUsd,
  liquidationThresholdBps,
  currentHealthFactor,
  selectedAsset,
  onBorrow,
  onViewLoan,
  processing = false,
}: BorrowProps) {
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

  const { borrowAmount, setBorrowAmount, maxBorrowAmount } = useBorrowState({
    collateralValueUsd,
    currentDebtUsd,
  });

  const metrics = useBorrowMetrics({
    borrowAmount,
    collateralValueUsd,
    currentDebtUsd,
    liquidationThresholdBps,
    currentHealthFactor,
  });

  const { isDisabled, buttonText, errorMessage } = validateBorrowAction(
    borrowAmount,
    metrics.healthFactorValue,
  );

  const sliderMaxBorrow = Math.max(maxBorrowAmount, MIN_SLIDER_MAX);

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
          borrowRatio={metrics.borrowRatio}
          borrowRatioOriginal={metrics.borrowRatioOriginal}
          healthFactor={metrics.healthFactor}
          healthFactorValue={metrics.healthFactorValue}
          healthFactorOriginal={metrics.healthFactorOriginal}
          healthFactorOriginalValue={metrics.healthFactorOriginalValue}
        />

        {/* Health Factor Error */}
        {errorMessage && (
          <p className="text-sm text-error-main">{errorMessage}</p>
        )}
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
