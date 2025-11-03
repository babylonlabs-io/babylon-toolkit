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

interface BorrowReviewModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  borrowData: {
    collateral: number;
    borrow: number;
  };
  ltv: number;
  processing?: boolean;
}

export function BorrowReviewModal({
  open,
  onClose,
  onConfirm,
  borrowData,
  ltv,
  processing = false,
}: BorrowReviewModalProps) {
  const { btcPrice, liquidationLtv, currentCollateralAmount } =
    useMarketDetailContext();

  const [acknowledged, setAcknowledged] = useState(false);

  // Calculate total collateral and format values
  const totalCollateral = currentCollateralAmount + borrowData.collateral;
  const collateralUsdValue = `$${(totalCollateral * btcPrice).toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )} USD`;
  const borrowUsdValue = `$${borrowData.borrow.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USD`;

  const handleClose = () => {
    setAcknowledged(false);
    onClose();
  };

  const handleConfirm = () => {
    if (!acknowledged) return;
    onConfirm();
  };

  const reviewFields = [
    {
      label: "Collateral",
      value: `${totalCollateral.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} BTC (${collateralUsdValue})`,
    },
    {
      label: "Borrow",
      value: `${borrowData.borrow.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USDC (${borrowUsdValue})`,
    },
    {
      label: "Borrow APY",
      value: "6.25%",
    },
    {
      label: "LTV",
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
              label={`I understand the risks, including liquidation if my LTV reaches ${liquidationLtv}%.`}
              labelClassName="text-accent-primary"
            />
          </div>
        </div>
      </DialogBody>

      <DialogFooter className="flex gap-4 pb-8 pt-0">
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
