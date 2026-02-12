/**
 * CollateralModal Component
 * Modal for adding or withdrawing collateral from an Aave position
 *
 * Supports two modes:
 * - "add": Add vaults as collateral to a position
 * - "withdraw": Withdraw collateral back to vaults (requires zero debt)
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

import { DetailsCard, PriceWarningBanner } from "@/components/shared";
import { usePrices } from "@/hooks/usePrices";
import { getCurrencyIconWithFallback } from "@/services/token";
import { formatBtcAmount, formatUsdValue } from "@/utils/formatting";

import {
  AMOUNT_INPUT_CLASS_NAME,
  BTC_TOKEN,
  MIN_SLIDER_MAX,
} from "../../constants";

import { useAddCollateralModal, useWithdrawCollateralModal } from "./hooks";

export type CollateralMode = "add" | "withdraw";

export interface CollateralModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: CollateralMode;
}

const MODE_CONFIG = {
  add: {
    title: "Collateralize",
    description: "Enter the amount of BTC you want to collateralize.",
    buttonText: "Deposit",
    processingText: "Processing...",
  },
  withdraw: {
    title: "Withdraw Collateral",
    description:
      "Enter the amount of BTC you want to withdraw from collateral.",
    buttonText: "Withdraw",
    processingText: "Processing...",
  },
} as const;

export function CollateralModal({
  isOpen,
  onClose,
  mode,
}: CollateralModalProps) {
  const addCollateralHook = useAddCollateralModal();
  const withdrawCollateralHook = useWithdrawCollateralModal();

  const hook = mode === "add" ? addCollateralHook : withdrawCollateralHook;
  const config = MODE_CONFIG[mode];

  const {
    collateralAmount,
    setCollateralAmount,
    maxCollateralAmount,
    selectedCollateralValueUsd,
    collateralSteps,
    detailRows,
    handleSubmit,
    isProcessing,
    isDisabled,
    errorMessage,
  } = hook;

  // Fetch price metadata for warnings
  const { metadata, hasStalePrices, hasPriceFetchError } = usePrices();

  const onSubmit = async () => {
    const success = await handleSubmit();
    if (success) {
      onClose();
    }
  };

  const sliderMax = Math.max(maxCollateralAmount, MIN_SLIDER_MAX);

  return (
    <ResponsiveDialog open={isOpen} onClose={onClose}>
      <DialogHeader
        title={config.title}
        onClose={onClose}
        className="text-accent-primary"
      />
      <DialogBody className="space-y-6 pb-6">
        <p className="text-base text-accent-secondary">{config.description}</p>

        {/* Price warning banner */}
        {(hasStalePrices || hasPriceFetchError) && (
          <PriceWarningBanner
            metadata={metadata}
            hasPriceFetchError={hasPriceFetchError}
            hasStalePrices={hasStalePrices}
          />
        )}

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
            rightField={
              hasPriceFetchError
                ? undefined
                : {
                    value: formatUsdValue(selectedCollateralValueUsd),
                  }
            }
            sliderActiveColor="#F7931A"
            inputClassName={AMOUNT_INPUT_CLASS_NAME}
          />
        </SubSection>

        {/* Details Card */}
        <DetailsCard rows={detailRows} />
      </DialogBody>

      <DialogFooter className="border-t border-secondary-strokeLight pt-4">
        <Button
          variant="contained"
          color="primary"
          onClick={onSubmit}
          disabled={isDisabled}
          className="w-full"
        >
          {isProcessing
            ? config.processingText
            : (errorMessage ?? config.buttonText)}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
