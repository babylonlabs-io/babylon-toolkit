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

interface RepayReviewModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  repayAmount: number;
  repaySymbol: string;
  repayUsdValue: string;
  withdrawAmount: number;
  withdrawSymbol: string;
  withdrawUsdValue: string;
  ltv: number;
  liquidationLtv: number;
  processing?: boolean;
}

export function RepayReviewModal({
  open,
  onClose,
  onConfirm,
  repayAmount,
  repaySymbol,
  repayUsdValue,
  withdrawAmount,
  withdrawSymbol,
  withdrawUsdValue,
  ltv,
  liquidationLtv,
  processing = false,
}: RepayReviewModalProps) {
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
      label: "Repayment Amount",
      value: `${repayAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${repaySymbol} (${repayUsdValue})`,
    },
    {
      label: "Withdraw Collateral",
      value: `${withdrawAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} ${withdrawSymbol} (${withdrawUsdValue})`,
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
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-secondary-strokeDark bg-surface-secondary p-4 transition-colors hover:border-accent-primary/30">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-5 w-5 cursor-pointer accent-primary-light"
            />
            <Text variant="body2" className="text-accent-primary">
              Your BTC remains secure and cannot be accessed by third parties. Only you can withdraw your funds. After submission, your deposit will be verified. This may take up to 5 hours, during which your deposit will appear as Pending until confirmed on the Bitcoin network.
            </Text>
          </label>
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

