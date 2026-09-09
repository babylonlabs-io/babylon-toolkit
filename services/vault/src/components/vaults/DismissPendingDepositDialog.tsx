/**
 * Confirmation for removing a pending deposit this browser holds on its own.
 * Only ever opened for a deposit the indexer answered on and did not return.
 */

import {
  Button,
  DialogBody,
  DialogFooter,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

interface DismissPendingDepositDialogProps {
  open: boolean;
  /** The last confirmation could not be written to localStorage. */
  failed: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DismissPendingDepositDialog({
  open,
  failed,
  onCancel,
  onConfirm,
}: DismissPendingDepositDialogProps) {
  return (
    <ResponsiveDialog open={open} onClose={onCancel}>
      <DialogBody className="px-4 py-10 text-accent-primary sm:px-6">
        <Heading variant="h5" className="mb-4 text-accent-primary">
          {COPY.vaults.dismissPending.title}
        </Heading>
        <Text variant="body1" className="text-accent-secondary">
          {COPY.vaults.dismissPending.body}
        </Text>
        <Text variant="body2" className="mt-4 text-accent-secondary">
          {COPY.vaults.dismissPending.warning}
        </Text>
        {failed && (
          <Text
            variant="body2"
            role="alert"
            className="mt-4 text-error-main"
            data-testid="pending-deposit-dismiss-error"
          >
            {COPY.vaults.dismissPending.failed}
          </Text>
        )}
      </DialogBody>
      <DialogFooter className="flex gap-4 px-4 pb-8 sm:px-6">
        <Button variant="outlined" fluid onClick={onCancel}>
          {COPY.vaults.dismissPending.cancelButton}
        </Button>
        <Button fluid onClick={onConfirm}>
          {COPY.vaults.dismissPending.confirmButton}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
