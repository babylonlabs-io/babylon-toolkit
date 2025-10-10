import {
  Button,
  DialogBody,
  DialogFooter,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";

interface PeginSuccessModalProps {
  open: boolean;
  onClose: () => void;
  amount: number;
}

/**
 * PeginSuccessModal - Success celebration modal after deposit completion
 * 
 * Displays:
 * - Mascot image (celebrating)
 * - "BTC Peg-in Successful" heading
 * - Confirmation message with wait time (~5 hours)
 * - "Done" button to close
 */
export function PeginSuccessModal({
  open,
  onClose,
}: PeginSuccessModalProps) {
  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogBody className="px-4 py-16 text-center text-accent-primary sm:px-6">
        <img
          src="/mascot-smile-expression.png"
          alt="Success mascot"
          className="mx-auto mb-6 size-auto"
        />

        <Heading variant="h4" className="mb-4 text-xl sm:text-2xl">
          BTC Deposit Successful
        </Heading>

        <Text variant="body1" className="text-sm text-accent-secondary sm:text-base">
          Your deposit has been recorded and is now awaiting confirmation on
          the Bitcoin network. This usually takes up to 5 hours.
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
