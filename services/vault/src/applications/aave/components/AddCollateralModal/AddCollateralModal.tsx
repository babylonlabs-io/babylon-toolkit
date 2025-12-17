/**
 * AddCollateralModal Component
 * Modal for adding vaults as collateral to an Aave position
 *
 * This modal is self-contained - it uses useAddCollateralModal hook
 * which handles all data fetching, state, and transactions.
 */

import {
  AmountSlider,
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  ResponsiveDialog,
  SubSection,
} from "@babylonlabs-io/core-ui";

import { getCurrencyIconWithFallback } from "@/services/token";
import { formatBtcAmount, formatUsdValue } from "@/utils/formatting";

import { BTC_TOKEN, MIN_SLIDER_MAX } from "../../constants";

import { CollateralDetailsCard } from "./CollateralDetailsCard";
import { useAddCollateralModal } from "./hooks";

export interface AddCollateralModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddCollateralModal({
  isOpen,
  onClose,
}: AddCollateralModalProps) {
  const {
    collateralAmount,
    setCollateralAmount,
    maxCollateralAmount,
    selectedCollateralValueUsd,
    currentHealthFactorValue,
    projectedHealthFactorValue,
    collateralSteps,
    handleDeposit,
    isProcessing,
    isDisabled,
  } = useAddCollateralModal();

  const onDeposit = async () => {
    const success = await handleDeposit();
    if (success) {
      onClose();
    }
  };

  const sliderMax = Math.max(maxCollateralAmount, MIN_SLIDER_MAX);

  return (
    <ResponsiveDialog open={isOpen} onClose={onClose}>
      <DialogHeader
        title="Collateralize"
        onClose={onClose}
        className="text-accent-primary"
      />
      <DialogBody className="space-y-6 pb-6">
        <p className="text-base text-accent-secondary">
          Enter the amount of BTC you want to collateralize.
        </p>

        {/* BTC Amount Slider - uses vault bucket steps */}
        <SubSection>
          <AmountSlider
            amount={collateralAmount}
            currencyIcon={getCurrencyIconWithFallback(
              BTC_TOKEN.icon,
              BTC_TOKEN.symbol,
            )}
            currencyName={BTC_TOKEN.name}
            onAmountChange={(e) =>
              setCollateralAmount(parseFloat(e.target.value) || 0)
            }
            sliderValue={collateralAmount}
            sliderMin={0}
            sliderMax={sliderMax}
            sliderStep={sliderMax / 1000}
            sliderSteps={collateralSteps}
            onSliderChange={setCollateralAmount}
            sliderVariant="primary"
            leftField={{
              label: "Max",
              value: formatBtcAmount(maxCollateralAmount),
            }}
            onMaxClick={() => setCollateralAmount(maxCollateralAmount)}
            rightField={{
              value: formatUsdValue(selectedCollateralValueUsd),
            }}
            sliderActiveColor="#F7931A"
          />
        </SubSection>

        {/* Details Card */}
        <CollateralDetailsCard
          currentHealthFactorValue={currentHealthFactorValue}
          projectedHealthFactorValue={projectedHealthFactorValue}
          showTransition={collateralAmount > 0}
        />
      </DialogBody>

      <DialogFooter className="border-t border-secondary-strokeLight pt-4">
        <Button
          variant="contained"
          color="primary"
          onClick={onDeposit}
          disabled={isDisabled}
          className="w-full"
        >
          {isProcessing ? "Processing..." : "Deposit"}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
