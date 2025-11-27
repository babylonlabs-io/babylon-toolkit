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
  amount: bigint;
}

export function CollateralDepositSuccessModal({
  open,
  onClose,
}: CollateralDepositSuccessModalProps) {
  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogBody className="px-4 py-16 text-center text-accent-primary sm:px-6">
        <img
          src="/images/btc.png"
          alt="Bitcoin"
          className="mx-auto h-auto w-full max-w-[160px]"
        />

        <Heading
          variant="h4"
          className="mb-4 mt-6 text-xl text-accent-primary sm:text-2xl"
        >
          Deposit Request Submitted
        </Heading>

        <Text
          variant="body1"
          className="text-sm text-accent-secondary sm:text-base"
        >
          Your deposit request has been sent. Vault Providers are preparing
          transactions to secure your BTC, and you'll be asked to sign
          additional Bitcoin transactions once they're ready.
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
