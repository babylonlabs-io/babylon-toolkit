import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";

interface RedeemSuccessModalProps {
  open: boolean;
  onClose: () => void;
  btcAmount: string;
}

/**
 * RedeemSuccessModal - Success confirmation modal for redeem flow
 *
 * Shown after the redeem transaction is successfully signed and submitted.
 */
export function RedeemSuccessModal({
  open,
  onClose,
  btcAmount,
}: RedeemSuccessModalProps) {
  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Redeem Successful"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="text-accent-primary flex flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
        <Text variant="body1" className="text-accent-secondary text-sm sm:text-base">
          Successfully redeemed {btcAmount} BTC. Your BTC will be returned to your Bitcoin address.
        </Text>

        <Text variant="body2" className="text-accent-secondary text-xs sm:text-sm">
          The vault unlock process may take some time to complete on the Bitcoin network.
        </Text>
      </DialogBody>

      <DialogFooter className="flex gap-4">
        <Button
          variant="contained"
          className="flex-1 text-xs sm:text-base"
          onClick={onClose}
        >
          Done
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
