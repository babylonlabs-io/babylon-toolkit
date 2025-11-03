import {
  Button,
  Checkbox,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { useMarketDetailContext } from "../../../../context/MarketDetailContext";

interface RepayReviewModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (repayAmount: number, withdrawAmount: number) => void;
  repayData: {
    repay: number;
    withdraw: number;
  };
  ltv: number;
  processing?: boolean;
}

export function RepayReviewModal({
  open,
  onClose,
  onConfirm,
  repayData,
  ltv,
  processing = false,
}: RepayReviewModalProps) {
  const {
    btcPrice,
    liquidationLtv,
    currentLoanAmount,
    currentCollateralAmount,
  } = useMarketDetailContext();

  const [acknowledged, setAcknowledged] = useState(false);

  // Calculate remaining amounts after transaction
  const remainingLoanAmount = currentLoanAmount - repayData.repay;
  const remainingCollateral = currentCollateralAmount - repayData.withdraw;

  // Format USD values for action amounts
  const repayUsdValue = `$${repayData.repay.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USD`;
  const withdrawUsdValue = `$${(repayData.withdraw * btcPrice).toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )} USD`;

  // Format USD values for remaining amounts
  const remainingLoanUsdValue = `$${remainingLoanAmount.toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )} USD`;
  const remainingCollateralUsdValue = `$${(
    remainingCollateral * btcPrice
  ).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USD`;

  const handleClose = () => {
    setAcknowledged(false);
    onClose();
  };

  const handleConfirm = () => {
    if (!acknowledged) return;
    onConfirm(repayData.repay, repayData.withdraw);
  };

  // Build review fields showing both action amounts and resulting state
  const reviewFields = [
    // Show repay amount if repaying
    ...(repayData.repay > 0
      ? [
          {
            label: "Repayment Amount",
            value: `${repayData.repay.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USDC (${repayUsdValue})`,
          },
        ]
      : []),
    // Show withdraw amount if withdrawing
    ...(repayData.withdraw > 0
      ? [
          {
            label: "Withdraw Collateral",
            value: `${repayData.withdraw.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} BTC (${withdrawUsdValue})`,
          },
        ]
      : []),
    {
      label: "Remaining Loan Amount",
      value: `${remainingLoanAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USDC (${remainingLoanUsdValue})`,
    },
    {
      label: "Remaining Collateral",
      value: `${remainingCollateral.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} BTC (${remainingCollateralUsdValue})`,
    },
    {
      label: "New LTV",
      value: `${ltv.toFixed(2)}%`,
    },
    {
      label: "Liquidation LTV",
      value: `${liquidationLtv}%`,
    },
  ];

  return (
    <ResponsiveDialog open={open} onClose={handleClose}>
      <DialogHeader
        title="Review"
        onClose={handleClose}
        className="text-accent-primary"
      />

      <DialogBody className="mb-8 mt-4 flex flex-col gap-4 text-accent-primary">
        <Text variant="body2" className="text-accent-secondary">
          Review the details before confirming your deposit
        </Text>

        {/* Review Fields */}
        <div className="flex flex-col">
          {reviewFields.map((field) => (
            <div key={field.label}>
              <div className="flex justify-between py-3">
                <Text variant="body1" className="text-accent-secondary">
                  {field.label}
                </Text>
                <Text variant="body1" className="text-right font-medium">
                  {field.value}
                </Text>
              </div>
            </div>
          ))}
        </div>

        <div className="border-divider w-full border-t" />

        {/* Attention Section */}
        <div className="pt-2">
          <Heading variant="h6" className="mb-2">
            Attention!
          </Heading>

          {/* Risk Acknowledgment Checkbox */}
          <div className="bg-surface-secondary flex cursor-pointer items-start gap-3 rounded-lg border border-secondary-strokeDark p-4 transition-colors hover:border-accent-primary/30">
            <Checkbox
              checked={acknowledged}
              onChange={(checked) => setAcknowledged(checked || false)}
              variant="default"
              label="Your BTC remains secure and cannot be accessed by third parties. Only you can withdraw your funds. After submission, your deposit will be verified. This may take up to 5 hours, during which your deposit will appear as Pending until confirmed on the Bitcoin network."
              labelClassName="text-accent-primary"
            />
          </div>
        </div>
      </DialogBody>

      <DialogFooter className="flex gap-4 pb-8 pt-0">
        <Button
          variant="outlined"
          color="primary"
          onClick={handleClose}
          className="flex-1"
          disabled={processing}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleConfirm}
          className="flex-1"
          disabled={!acknowledged || processing}
        >
          {processing ? "Processing..." : "Confirm"}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
