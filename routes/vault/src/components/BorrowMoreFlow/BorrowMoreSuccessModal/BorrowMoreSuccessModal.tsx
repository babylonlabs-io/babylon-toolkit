import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";

interface BorrowMoreSuccessModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * BorrowMoreSuccessModal - Success confirmation for borrow more flow
 */
export function BorrowMoreSuccessModal({
  open,
  onClose,
}: BorrowMoreSuccessModalProps) {
  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Borrow Successful!"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="text-accent-primary flex flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
        <Text variant="body1" className="text-accent-secondary text-sm sm:text-base">
          You have successfully borrowed additional funds from your position.
          The borrowed funds have been transferred to your wallet.
        </Text>

        <Text variant="body2" className="text-accent-secondary text-xs">
          Remember to monitor your position's LTV ratio to avoid liquidation.
        </Text>
      </DialogBody>

      <DialogFooter>
        <Button
          variant="contained"
          onClick={onClose}
          className="w-full text-xs sm:text-base"
        >
          Close
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
