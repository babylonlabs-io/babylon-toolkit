/**
 * VaultActivatedModal
 *
 * Success modal shown once a BTC Vault has been fully activated (the contract
 * reports ACTIVE). Center-aligned confirmation modeled on
 * BroadcastSuccessModal: a green success badge, heading, body, and a single
 * primary "Go to Dashboard" CTA.
 */

import {
  Button,
  DialogBody,
  DialogFooter,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";
import { IoCheckmarkSharp } from "react-icons/io5";

import { COPY } from "@/copy";

interface VaultActivatedModalProps {
  open: boolean;
  onClose: () => void;
  onGoToDashboard: () => void;
}

export function VaultActivatedModal({
  open,
  onClose,
  onGoToDashboard,
}: VaultActivatedModalProps) {
  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogBody className="px-4 py-16 text-center text-accent-primary sm:px-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-main/10">
          <IoCheckmarkSharp size={40} className="text-success-light" />
        </div>

        <Heading
          variant="h4"
          className="mb-4 mt-6 text-xl text-accent-primary sm:text-2xl"
        >
          {COPY.deposit.vaultActivatedSuccess.heading}
        </Heading>

        <Text
          variant="body1"
          className="text-sm text-accent-secondary sm:text-base"
        >
          {COPY.deposit.vaultActivatedSuccess.body}
        </Text>
      </DialogBody>

      <DialogFooter className="flex gap-4 px-4 pb-8 sm:px-6">
        <Button
          variant="contained"
          color="primary"
          onClick={onGoToDashboard}
          className="w-full"
        >
          {COPY.deposit.vaultActivatedSuccess.goToDashboard}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
