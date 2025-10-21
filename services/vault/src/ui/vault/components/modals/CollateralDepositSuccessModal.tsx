import {
  Button,
  DialogBody,
  DialogFooter,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";

interface CollateralDepositSuccessModalProps {
  open: boolean;
  onClose: () => void;
  amount: number;
}

export function CollateralDepositSuccessModal({
  open,
  onClose,
}: CollateralDepositSuccessModalProps) {
  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogBody className="px-4 py-16 text-center text-accent-primary sm:px-6">
        <img
          src="/btc.png"
          alt="Bitcoin"
          className="h-auto mx-auto w-full max-w-[160px]"
        />

        <Heading variant="h4" className="mb-4 mt-6 text-xl sm:text-2xl text-accent-primary">
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

