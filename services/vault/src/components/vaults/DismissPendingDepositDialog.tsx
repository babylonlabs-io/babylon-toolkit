/**
 * Confirmation for removing the pending deposits this browser holds on its own.
 * Only ever opened for deposits the indexer answered on and did not return, and
 * always for a whole split-deposit batch at once.
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
import type { RemovePendingPeginsResult } from "@/storage/peginStorage";

/**
 * Why the last confirmation removed nothing — a storage failure, a deposit the
 * indexer has since returned, or an indexer that could no longer answer for it.
 */
export type DismissPendingDepositError =
  | Exclude<RemovePendingPeginsResult, "removed">
  | "no-longer-removable"
  | "unavailable";

const ERROR_COPY: Record<DismissPendingDepositError, string> = {
  "write-failed": COPY.vaults.dismissPending.writeFailed,
  unreadable: COPY.vaults.dismissPending.unreadable,
  "no-longer-removable": COPY.vaults.dismissPending.noLongerRemovable,
  unavailable: COPY.vaults.dismissPending.unavailable,
};

interface DismissPendingDepositDialogProps {
  open: boolean;
  /** How many records the confirmation would remove. */
  count: number;
  /** Why the last confirmation removed nothing, or null before one was made. */
  error: DismissPendingDepositError | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DismissPendingDepositDialog({
  open,
  count,
  error,
  onCancel,
  onConfirm,
}: DismissPendingDepositDialogProps) {
  const copy = COPY.vaults.dismissPending;
  const isBatch = count > 1;

  return (
    <ResponsiveDialog open={open} onClose={onCancel}>
      <DialogBody className="px-4 py-10 text-accent-primary sm:px-6">
        <Heading variant="h5" className="mb-4 text-accent-primary">
          {isBatch ? copy.batchTitle(count) : copy.title}
        </Heading>
        <Text variant="body1" className="text-accent-secondary">
          {isBatch ? copy.batchBody(count) : copy.body}
        </Text>
        <Text variant="body2" className="mt-4 text-accent-secondary">
          {isBatch ? copy.batchWarning(count) : copy.warning}
        </Text>
        {error && (
          <Text
            variant="body2"
            role="alert"
            className="mt-4 text-error-main"
            data-testid="pending-deposit-dismiss-error"
          >
            {ERROR_COPY[error]}
          </Text>
        )}
      </DialogBody>
      <DialogFooter className="flex gap-4 px-4 pb-8 sm:px-6">
        <Button variant="outlined" fluid onClick={onCancel}>
          {copy.cancelButton}
        </Button>
        <Button fluid onClick={onConfirm}>
          {copy.confirmButton}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
