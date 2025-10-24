import {
  Button,
  DialogBody,
  DialogFooter,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";

interface RepaySuccessModalProps {
  open: boolean;
  onClose: () => void;
  repayAmount: number;
  withdrawAmount: number;
  repaySymbol: string;
  withdrawSymbol: string;
}

/**
 * RepaySuccessModal - Success celebration modal after repayment completion
 *
 * Displays:
 * - "Repayment and Withdrawal Successful" heading
 * - Repaid amount and collateral withdrawn confirmation
 * - "Done" button to close
 */
export function RepaySuccessModal({
  open,
  onClose,
  repayAmount,
  withdrawAmount,
  repaySymbol,
  withdrawSymbol,
}: RepaySuccessModalProps) {
  const formattedRepayAmount = repayAmount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const formattedWithdrawAmount = withdrawAmount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogBody className="px-4 py-16 text-center text-accent-primary sm:px-6">
        <img
          src="/images/usdc.png"
          alt="USDC"
          className="mx-auto mb-6 h-24 w-24"
        />

        <Heading variant="h4" className="mb-4 text-xl sm:text-2xl">
          Repayment and Withdrawal Successful
        </Heading>

        <Text
          variant="body1"
          className="text-sm text-accent-secondary sm:text-base"
        >
          You have repaid {formattedRepayAmount} {repaySymbol} and withdrawn{" "}
          {formattedWithdrawAmount} {withdrawSymbol}
          <br />
          back to your wallet.
        </Text>
      </DialogBody>

      <DialogFooter className="flex gap-4 px-4 pb-8 sm:px-6">
        <Button
          variant="contained"
          color="primary"
          onClick={onClose}
          className="w-full"
        >
          Done
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
