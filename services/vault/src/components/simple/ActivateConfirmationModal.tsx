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
        title="Activate your vault"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-4 pt-4 text-accent-primary sm:px-6">
        <Text variant="body2" className="text-accent-secondary">
          Activating your vault reveals the HTLC secret on Ethereum and
          finalizes your deposit. Before continuing, make sure you have
          downloaded your vault artifacts — these files let you independently
          claim your funds if the vault provider is unavailable.
        </Text>

        {downloaded ? (
          <Warning>
            We&apos;ve already recorded that you downloaded artifacts for this
            vault from this browser. If you&apos;ve since cleared site data or
            switched devices, download them again before activating.
          </Warning>
        ) : (
          <>
            <Warning>
              You haven&apos;t downloaded the artifacts for this vault yet on
              this browser. If you lose them and the vault provider goes
              offline, you will not be able to independently claim your funds.
            </Warning>
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={acknowledged}
                onChange={() => setAcknowledged((v) => !v)}
                variant="default"
                showLabel={false}
              />
              <span className="text-accent-primary">
                I understand the risk of activating without downloading my
                artifacts.
              </span>
            </label>
          </>
        )}
      </DialogBody>

      <DialogFooter className="flex flex-col gap-3 px-4 pb-6 sm:px-6">
        {downloaded ? (
          <Button variant="contained" className="w-full" onClick={onConfirm}>
            Activate
          </Button>
        ) : (
          <>
            <Button
              variant="contained"
              className="w-full"
              onClick={onDownloadArtifacts}
            >
              Download Artifacts
            </Button>
            <Button
              variant="outlined"
              className="w-full"
              onClick={onConfirm}
              disabled={!acknowledged}
            >
              Activate without downloading
            </Button>
          </>
        )}
      </DialogFooter>
    </ResponsiveDialog>
  );
}
