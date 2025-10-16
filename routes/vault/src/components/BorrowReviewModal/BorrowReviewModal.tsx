import { useState } from "react";
import { 
  ResponsiveDialog,
  DialogHeader, 
  DialogBody, 
  DialogFooter, 
  Button, 
  Text,
  Heading,
} from "@babylonlabs-io/core-ui";

interface BorrowReviewModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  collateralAmount: number;
  collateralSymbol: string;
  collateralUsdValue: string;
  borrowAmount: number;
  borrowSymbol: string;
  borrowUsdValue: string;
  borrowApy: number;
  ltv: number;
  liquidationLtv: number;
  processing?: boolean;
}

export function BorrowReviewModal({
  open,
  onClose,
  onConfirm,
  collateralAmount,
  collateralSymbol,
  collateralUsdValue,
  borrowAmount,
  borrowSymbol,
  borrowUsdValue,
  borrowApy,
  ltv,
  liquidationLtv,
  processing = false,
}: BorrowReviewModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);

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
      value: `${collateralAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} ${collateralSymbol} (${collateralUsdValue})`,
    },
    {
      label: "Borrow",
      value: `${borrowAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${borrowSymbol} (${borrowUsdValue})`,
    },
    {
      label: "Borrow APY",
      value: `${borrowApy.toFixed(2)}%`,
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
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-secondary-strokeDark bg-surface-secondary p-4 transition-colors hover:border-accent-primary/30">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-5 w-5 cursor-pointer accent-primary-light"
            />
            <Text variant="body2" className="text-accent-primary">
              I understand the risks, including liquidation if my LTV reaches {liquidationLtv}%.
            </Text>
          </label>
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

