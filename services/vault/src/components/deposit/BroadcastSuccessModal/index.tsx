/**
 * BroadcastSuccessModal
 *
 * Success confirmation modal shown after BTC transaction broadcast completes.
 * Displays success message and explains the confirmation process.
 */

import {
  Button,
  DialogBody,
  DialogFooter,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";

const btcConfig = getNetworkConfigBTC();

interface BroadcastSuccessModalProps {
  open: boolean;
  onClose: () => void;
  amount: string;
}

/**
 * BroadcastSuccessModal - Success confirmation modal
 *
 * Displays:
 * - BTC icon
 * - "Broadcast Successful" heading
 * - Confirmation message about Bitcoin network confirmations
 * - "Done" button to close
 */
export function BroadcastSuccessModal({
  open,
  onClose,
  amount,
}: BroadcastSuccessModalProps) {
  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogBody className="px-4 py-16 text-center text-accent-primary sm:px-6">
        <img
          src={btcConfig.icon}
          alt={btcConfig.name}
          className="mx-auto h-auto w-full max-w-[160px]"
        />

        <Heading
          variant="h4"
          className="mb-4 mt-6 text-xl text-accent-primary sm:text-2xl"
        >
          Broadcast Successful
        </Heading>

        <Text
          variant="body1"
          className="text-sm text-accent-secondary sm:text-base"
        >
          Your Bitcoin transaction has been broadcast to the network. Your
          deposit of {amount} {btcConfig.coinSymbol} is now awaiting
          confirmation on the Bitcoin blockchain.
        </Text>

        <Text
          variant="body2"
          className="mt-4 text-xs text-accent-secondary sm:text-sm"
        >
          This usually takes a few hours. You can continue using the platform
          while your deposit confirms.
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
