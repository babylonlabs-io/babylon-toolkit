import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  ResponsiveDialog,
} from "@babylonlabs-io/core-ui";

import { V3ModalShell } from "@/components/shared/V3ModalShell";
import { FeatureFlags } from "@/config";
import { COPY } from "@/copy";

import { ReorderSuccessIcon } from "./ReorderSuccessIcon";

interface ReorderSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReorderSuccessModal({
  isOpen,
  onClose,
}: ReorderSuccessModalProps) {
  // v2 keeps the ResponsiveDialog bottom-sheet; only v3 uses the full-screen
  // shell + centered card.
  if (!FeatureFlags.isV3UiEnabled) {
    return (
      <ResponsiveDialog open={isOpen} onClose={onClose}>
        <DialogHeader title={COPY.reorder.successTitle} onClose={onClose} />
        <DialogBody>
          <ReorderSuccessIcon className="mx-auto my-3 text-accent-primary" />
          <p className="py-3 text-center text-accent-secondary">
            {COPY.reorder.successText}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="contained"
            color="secondary"
            size="large"
            fluid
            onClick={onClose}
          >
            {COPY.reorder.doneButton}
          </Button>
        </DialogFooter>
      </ResponsiveDialog>
    );
  }

  return (
    <V3ModalShell
      open={isOpen}
      onClose={onClose}
      contentClassName="max-w-[564px]"
    >
      <div className="flex w-full flex-col items-center gap-10 rounded-2xl border border-secondary-strokeLight bg-primary-contrast px-6 pb-6 pt-10">
        <ReorderSuccessIcon className="text-accent-primary" />
        <div className="flex w-full flex-col items-center gap-4 text-center">
          <h2 className="text-[34px] leading-[1.235] tracking-[0.25px] text-accent-primary">
            {COPY.reorder.successTitle}
          </h2>
          <p className="text-xl leading-[1.6] tracking-[0.15px] text-accent-secondary">
            {COPY.reorder.successText}
          </p>
        </div>
        <Button
          variant="contained"
          color="secondary"
          size="large"
          fluid
          onClick={onClose}
        >
          {COPY.reorder.doneButton}
        </Button>
      </div>
    </V3ModalShell>
  );
}
