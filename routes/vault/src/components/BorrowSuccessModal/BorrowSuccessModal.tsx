import {
  Button,
  DialogBody,
  DialogFooter,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";

interface BorrowSuccessModalProps {
  open: boolean;
  onClose: () => void;
  borrowAmount: number;
  borrowSymbol: string;
}

/**
 * BorrowSuccessModal - Success celebration modal after borrow completion
 * 
 * Displays:
 * - Mascot image (celebrating)
 * - "Borrow Successful" heading
 * - Borrowed amount confirmation
 * - "Done" button to close
 */
export function BorrowSuccessModal({
  open,
  onClose,
  borrowAmount,
  borrowSymbol,
}: BorrowSuccessModalProps) {
  // Format amount with commas for readability
  const formattedAmount = borrowAmount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogBody className="px-4 py-16 text-center text-accent-primary sm:px-6">
        <img
          src="/usdc.png"
          alt="USDC"
          className="mx-auto mb-6 h-24 w-24"
        />

        <Heading variant="h4" className="mb-4 text-xl sm:text-2xl">
          Borrow Successful
        </Heading>

        <Text variant="body1" className="text-sm text-accent-secondary sm:text-base">
          {formattedAmount} {borrowSymbol} has been borrowed and is now available in your wallet.
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

