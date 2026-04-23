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
 * BroadcastSuccessModal - Pre-PegIn broadcast confirmation modal
 *
 * Important: this only confirms the Pre-PegIn BTC transaction is in the
 * mempool — the vault is NOT yet active. Several depositor steps still
 * remain (submit WOTS key, sign payouts, activate with HTLC secret).
 * The copy below makes that explicit so users don't think they're done.
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
          Pre-PegIn Broadcast
        </Heading>

        <Text
          variant="body1"
          className="text-sm text-accent-secondary sm:text-base"
        >
          Your Pre-PegIn Bitcoin transaction for {amount} {btcConfig.coinSymbol}{" "}
          has been broadcast to the network. Your vault is not active yet — this
          is just one step in the deposit lifecycle.
        </Text>

        <Text
          variant="body2"
          className="mt-4 text-xs text-accent-secondary sm:text-sm"
        >
          Once the Pre-PegIn confirms, the vault provider will prompt you to
          submit a WOTS key, sign payout authorizations, and finally activate
          the vault by revealing your HTLC secret. Check back here — the next
          required action will appear when it's ready.
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
