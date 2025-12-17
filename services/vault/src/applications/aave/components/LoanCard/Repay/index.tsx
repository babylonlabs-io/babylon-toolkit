/**
 * Repay Tab Component
 */

import { AmountSlider, Button, SubSection } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import {
  getCurrencyIconWithFallback,
  getTokenBrandColor,
} from "../../../../../services/token";
import { formatUsdValue } from "../../../../../utils/formatting";
import type { Asset } from "../../../types";
import { BorrowDetailsCard } from "../Borrow/BorrowDetailsCard";

import { useRepayMetrics } from "./hooks/useRepayMetrics";
import { useRepayState } from "./hooks/useRepayState";
import { validateRepayAction } from "./hooks/validateRepayAction";
import { RepaySuccessModal } from "./SuccessModal";

export interface RepayProps {
  /** Collateral value in USD (from Aave oracle) */
  collateralValueUsd: number;
  /** Current debt in USD (from Aave oracle) */
  currentDebtUsd: number;
  /** vBTC liquidation threshold in BPS (e.g., 8000 = 80%) */
  liquidationThresholdBps: number;
  /** Current health factor (null if no debt) */
  currentHealthFactor: number | null;
  /** Selected asset to repay (from route) */
  selectedAsset: Asset;
  onRepay: (repayAmount: number, withdrawCollateralAmount: number) => void;
  onViewLoan: () => void;
  processing?: boolean;
}

export function Repay({
  collateralValueUsd,
  currentDebtUsd,
  liquidationThresholdBps,
  currentHealthFactor,
  selectedAsset,
  //   onRepay,
  onViewLoan,
  processing = false,
}: RepayProps) {
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

  const { repayAmount, setRepayAmount, maxRepayAmount } = useRepayState({
    currentDebtUsd,
  });

  const metrics = useRepayMetrics({
    repayAmount,
    collateralValueUsd,
    currentDebtUsd,
    liquidationThresholdBps,
    currentHealthFactor,
  });

  const { isDisabled, buttonText, errorMessage } = validateRepayAction(
    repayAmount,
    maxRepayAmount,
  );

  const sliderMaxRepay = Math.max(maxRepayAmount, 0.0001);

  const handleRepay = () => {
    // TODO: Implement repay logic
    setIsSuccessModalOpen(true);
  };

  return (
    <div>
      {/* Repay Amount Section */}
      <h3 className="mb-4 text-[24px] font-normal text-accent-primary">
        Repay
      </h3>
      <div className="flex flex-col gap-2">
        <SubSection>
          <AmountSlider
            amount={repayAmount}
            currencyIcon={getCurrencyIconWithFallback(
              selectedAsset.icon,
              selectedAsset.symbol,
            )}
            currencyName={selectedAsset.name}
            onAmountChange={(e) =>
              setRepayAmount(parseFloat(e.target.value) || 0)
            }
            balanceDetails={{
              balance: sliderMaxRepay.toLocaleString(),
              symbol: selectedAsset.symbol,
              displayUSD: false,
            }}
            sliderValue={repayAmount}
            sliderMin={0}
            sliderMax={sliderMaxRepay}
            sliderStep={sliderMaxRepay / 1000}
            sliderSteps={[]}
            onSliderChange={setRepayAmount}
            sliderVariant="primary"
            leftField={{
              label: "Max",
              value: `${sliderMaxRepay.toLocaleString()} ${selectedAsset.symbol}`,
            }}
            onMaxClick={() => setRepayAmount(sliderMaxRepay)}
            rightField={{
              value: formatUsdValue(repayAmount),
            }}
            sliderActiveColor={getTokenBrandColor(selectedAsset.symbol)}
          />
        </SubSection>

        <BorrowDetailsCard
          borrowRatio={metrics.borrowRatio}
          borrowRatioOriginal={metrics.borrowRatioOriginal}
          healthFactor={metrics.healthFactor}
          healthFactorValue={metrics.healthFactorValue}
          healthFactorOriginal={metrics.healthFactorOriginal}
          healthFactorOriginalValue={metrics.healthFactorOriginalValue}
        />

        {errorMessage && (
          <p className="text-sm text-error-main">{errorMessage}</p>
        )}
      </div>

      {/* Repay Button */}
      <Button
        variant="contained"
        color="secondary"
        size="large"
        fluid
        disabled={isDisabled || processing}
        onClick={handleRepay}
        className="mt-6"
      >
        {processing ? "Processing..." : buttonText}
      </Button>

      {/* Success Modal */}
      <RepaySuccessModal
        open={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
        onViewLoan={onViewLoan}
        repayAmount={repayAmount}
        repaySymbol={selectedAsset.symbol}
        assetIcon={selectedAsset.icon}
      />
    </div>
  );
}
