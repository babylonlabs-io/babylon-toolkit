import {
  AmountSlider,
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";

interface RedeemCollateralModalProps {
  open: boolean;
  onClose: () => void;
  onRedeem: (amount: number) => void;
  availableBalance?: number; // Total available BTC to redeem
  btcPrice?: number;
}

export function RedeemCollateralModal({
  open,
  onClose,
  onRedeem,
  availableBalance = 10.0, // Default 10 BTC available
  btcPrice = 112694.16,
}: RedeemCollateralModalProps) {
  const [redeemAmount, setRedeemAmount] = useState(0);

  // Hardcoded redeem step array for demonstration
  // Values represent BTC amounts
  const redeemSteps = useMemo(() => {
    const availableBtc = availableBalance;
    return [
      { value: 0 },
      { value: availableBtc * 0.2 },
      { value: availableBtc * 0.4 },
      { value: availableBtc * 0.6 },
      { value: availableBtc * 0.8 },
      { value: availableBtc },
    ];
  }, [availableBalance]);

  const handleRedeem = () => {
    if (redeemAmount > 0) {
      onRedeem(redeemAmount);
    }
  };

  const handleClose = () => {
    setRedeemAmount(0);
    onClose();
  };

  return (
    <ResponsiveDialog open={open} onClose={handleClose}>
      <DialogHeader
        title="Redeem BTC"
        onClose={handleClose}
        className="text-accent-primary"
      />

      <DialogBody className="no-scrollbar mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-6 overflow-y-auto px-4 text-accent-primary sm:px-6">
        <Text variant="body2" className="text-accent-secondary">
          Enter the amount of BTC you want to redeem back to your wallet.
        </Text>

        <AmountSlider
          amount={redeemAmount}
          currencyIcon="/images/btc.png"
          currencyName="Bitcoin"
          balanceDetails={{
            balance: availableBalance,
            symbol: "BTC",
            price: btcPrice,
            displayUSD: false,
          }}
          sliderValue={redeemAmount}
          sliderMin={0}
          sliderMax={availableBalance}
          sliderStep={availableBalance / 1000}
          sliderSteps={redeemSteps}
          onSliderChange={setRedeemAmount}
          onSliderStepsChange={(selectedSteps) => {
            console.log("Redeem Collateral - Selected steps:", selectedSteps);
            // Handle cumulative step selection here
          }}
          sliderVariant="primary"
          leftField={{
            label: "Max",
            value: `${availableBalance.toFixed(4)} BTC`,
          }}
          onMaxClick={() => setRedeemAmount(availableBalance)}
          rightField={{
            value: `$${(redeemAmount * btcPrice).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} USD`,
          }}
        />
      </DialogBody>

      <DialogFooter className="flex items-center justify-end px-4 pb-6 sm:px-6">
        <Button
          variant="contained"
          color="primary"
          onClick={handleRedeem}
          disabled={redeemAmount === 0}
          className="text-sm sm:text-base"
        >
          {redeemAmount === 0 ? "Enter an amount" : "Redeem"}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
