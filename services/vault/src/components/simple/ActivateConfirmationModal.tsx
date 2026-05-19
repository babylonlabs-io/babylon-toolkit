import {
  Button,
  Checkbox,
  DialogBody,
  DialogFooter,
  DialogHeader,
  ResponsiveDialog,
  Text,
  Warning,
} from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";

import { COPY } from "@/copy";
import { hasArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

interface ActivateConfirmationModalProps {
  open: boolean;
  vaultId: string;
  /** Tick that bumps after a download completes; forces a re-read of the flag. */
  downloadCompletedAt?: number;
  onClose: () => void;
  onConfirm: () => void;
  onDownloadArtifacts: () => void;
}

export function ActivateConfirmationModal({
  open,
  vaultId,
  downloadCompletedAt,
  onClose,
  onConfirm,
  onDownloadArtifacts,
}: ActivateConfirmationModalProps) {
  const [downloaded, setDownloaded] = useState(() =>
    hasArtifactsDownloaded(vaultId),
  );
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDownloaded(hasArtifactsDownloaded(vaultId));
    setAcknowledged(false);
  }, [open, vaultId, downloadCompletedAt]);

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title={COPY.deposit.activateConfirmation.title}
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-4 pt-4 text-accent-primary sm:px-6">
        <Text variant="body2" className="text-accent-secondary">
          {COPY.deposit.activateConfirmation.body}
        </Text>

        {downloaded ? (
          <Warning>
            {COPY.deposit.activateConfirmation.alreadyDownloadedWarning}
          </Warning>
        ) : (
          <>
            <Warning>
              {COPY.deposit.activateConfirmation.notDownloadedWarning}
            </Warning>
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={acknowledged}
                onChange={() => setAcknowledged((v) => !v)}
                variant="default"
                showLabel={false}
              />
              <span className="text-accent-primary">
                {COPY.deposit.activateConfirmation.riskAcknowledgement}
              </span>
            </label>
          </>
        )}
      </DialogBody>

      <DialogFooter className="flex flex-col gap-3 px-4 pb-6 sm:px-6">
        {downloaded ? (
          <Button variant="contained" className="w-full" onClick={onConfirm}>
            {COPY.deposit.activateConfirmation.activateButton}
          </Button>
        ) : (
          <>
            <Button
              variant="contained"
              className="w-full"
              onClick={onDownloadArtifacts}
            >
              {COPY.deposit.activateConfirmation.downloadArtifactsButton}
            </Button>
            <Button
              variant="outlined"
              className="w-full"
              onClick={onConfirm}
              disabled={!acknowledged}
            >
              {
                COPY.deposit.activateConfirmation
                  .activateWithoutDownloadingButton
              }
            </Button>
          </>
        )}
      </DialogFooter>
    </ResponsiveDialog>
  );
}
