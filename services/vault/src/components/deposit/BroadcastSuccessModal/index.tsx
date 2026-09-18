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
import { COPY } from "@/copy";

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
 * remain (submit WOTS key, sign payouts, activate the BTCVault).
 * The copy below makes that explicit so users don't think they're done.
 */
export function BroadcastSuccessModal({
  open,
  onClose,
  amount,
}: BroadcastSuccessModalProps) {
  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      className="sm:w-[564px] [&_.bbn-dialog]:rounded-3xl [&_.bbn-dialog]:p-0"
    >
      <DialogBody className="px-6 pt-10 text-center text-accent-primary">
        <img
          src={btcConfig.icon}
          alt={btcConfig.name}
          className="mx-auto size-[100px]"
        />

        <Heading variant="h5" className="mb-4 mt-6 text-accent-primary">
          {COPY.deposit.broadcastSuccess.heading}
        </Heading>

        <Text variant="body1" className="text-accent-secondary">
          {COPY.deposit.broadcastSuccess.body(amount, btcConfig.coinSymbol)}
        </Text>

        <Text variant="body1" className="mt-4 text-accent-secondary">
          {COPY.deposit.broadcastSuccess.footnote}
        </Text>
      </DialogBody>

      <DialogFooter className="px-6 pb-6 pt-10">
        <Button
          variant="contained"
          color="primary"
          onClick={onClose}
          className="w-full rounded-lg"
        >
          {COPY.deposit.broadcastSuccess.doneButton}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
