/**
 * AddCollateralModal Component
 * Modal for adding vaults as collateral to an Aave position
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

import type { VaultData } from "../Overview/components/VaultsTable";

import { CollateralDetailsCard } from "./CollateralDetailsCard";
import { useAddCollateralState } from "./hooks/useAddCollateralState";

export interface AddCollateralModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeposit: (vaultIds: string[]) => void;
  /** Available vaults that can be added as collateral */
  availableVaults: VaultData[];
  /** Current collateral amount in BTC */
  currentCollateralBtc: number;
  /** Current debt value in USD */
  currentDebtUsd: number;
  /** Liquidation LTV percentage */
  liquidationLtv: number;
  /** Current BTC price in USD */
  btcPrice: number;
  /** Whether transaction is processing */
  processing?: boolean;
}

const BTC_ICON = "/images/btc.png";
const BTC_NAME = "Bitcoin";

export function AddCollateralModal({
  isOpen,
  onClose,
  onDeposit,
  availableVaults,
  currentCollateralBtc,
  currentDebtUsd,
  liquidationLtv,
  btcPrice,
  processing = false,
}: AddCollateralModalProps) {
  const {
    collateralAmount,
    setCollateralAmount,
    maxCollateralAmount,
    selectedVaultIds,
    projectedHealthFactor,
    collateralValueUsd,
  } = useAddCollateralState({
    availableVaults,
    currentCollateralBtc,
    currentDebtUsd,
    liquidationLtv,
    btcPrice,
  });

  const handleDeposit = () => {
    if (selectedVaultIds.length === 0) return;
    onDeposit(selectedVaultIds);
    console.log("selectedVaultIds", selectedVaultIds);
    console.log("Depositing...");
  };

  const isDisabled = collateralAmount === 0 || processing;

  const sliderMax = Math.max(maxCollateralAmount, 0.00000001);

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

        {/* BTC Amount Slider */}
        <SubSection>
          <AmountSlider
            amount={collateralAmount}
            currencyIcon={getCurrencyIconWithFallback(BTC_ICON, "BTC")}
            currencyName={BTC_NAME}
            onAmountChange={(e) =>
              setCollateralAmount(parseFloat(e.target.value) || 0)
            }
            sliderValue={collateralAmount}
            sliderMin={0}
            sliderMax={sliderMax}
            sliderStep={sliderMax / 1000}
            sliderSteps={[]}
            onSliderChange={setCollateralAmount}
            sliderVariant="primary"
            leftField={{
              label: "Max",
              value: formatBtcAmount(maxCollateralAmount),
            }}
            onMaxClick={() => setCollateralAmount(maxCollateralAmount)}
            rightField={{
              value: formatUsdValue(collateralValueUsd),
            }}
            sliderActiveColor="#F7931A"
          />
        </SubSection>

        {/* Details Card */}
        <CollateralDetailsCard
          healthFactor={projectedHealthFactor}
          hasDebt={currentDebtUsd > 0}
        />
      </DialogBody>

      <DialogFooter className="border-t border-secondary-strokeLight pt-4">
        <Button
          variant="contained"
          color="primary"
          onClick={handleDeposit}
          disabled={isDisabled}
          className="w-full"
        >
          {processing ? "Processing..." : "Deposit"}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
