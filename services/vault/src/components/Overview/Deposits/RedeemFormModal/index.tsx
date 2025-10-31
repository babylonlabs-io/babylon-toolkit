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

import {
  btcNumberToSatoshi,
  satoshiToBtcNumber,
} from "../../../../utils/btcConversion";

interface RedeemCollateralModalProps {
  open: boolean;
  onClose: () => void;
  onRedeem: (amount: bigint) => void;
  availableBalance?: bigint;
  btcPrice?: number;
}

export function RedeemCollateralModal({
  open,
  onClose,
  onRedeem,
  availableBalance = 1000000000n, // Default 10 BTC in satoshis
  btcPrice = 112694.16,
}: RedeemCollateralModalProps) {
  const [redeemAmount, setRedeemAmount] = useState(0);

  const availableBtc = useMemo(
    () => satoshiToBtcNumber(availableBalance),
    [availableBalance],
  );

  // Hardcoded redeem step array for demonstration
  // Values represent BTC amounts
  const redeemSteps = useMemo(() => {
    return [
      { value: 0 },
      { value: availableBtc * 0.2 },
      { value: availableBtc * 0.4 },
      { value: availableBtc * 0.6 },
      { value: availableBtc * 0.8 },
      { value: availableBtc },
    ];
  }, [availableBtc]);

  const handleRedeem = () => {
    if (redeemAmount > 0) {
      const amountSats = btcNumberToSatoshi(redeemAmount);
      onRedeem(amountSats);
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
            balance: availableBtc,
            symbol: "BTC",
            price: btcPrice,
            displayUSD: false,
          }}
          sliderValue={redeemAmount}
          sliderMin={0}
          sliderMax={availableBtc}
          sliderStep={availableBtc / 1000}
          sliderSteps={redeemSteps}
          onSliderChange={setRedeemAmount}
          onSliderStepsChange={() => {
            // Handle cumulative step selection here
          }}
          sliderVariant="primary"
          leftField={{
            label: "Max",
            value: `${availableBtc.toFixed(4)} BTC`,
          }}
          onMaxClick={() => setRedeemAmount(availableBtc)}
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
