import {
  Button,
  DialogBody,
  DialogFooter,
  ResponsiveDialog,
} from "@babylonlabs-io/core-ui";
import { useEffect, useRef, useState } from "react";
import type { Hex } from "viem";

import { ArtifactModalIcon } from "@/components/deposit/ArtifactModalIcon";
import {
  RecoveryArtifactsCard,
  type RecoveryArtifactsCardHandle,
} from "@/components/deposit/RecoveryArtifactsCard";
import { COPY } from "@/copy";
import { hasArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

/** The vault-provider routing inputs an artifact download needs. */
export interface ArtifactDownloadModalParams {
  providerAddress: string;
  peginTxid: string;
  depositorPk: string;
}

interface ArtifactDownloadModalProps extends ArtifactDownloadModalParams {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  vaultId: Hex;
  /**
   * Unsigned Pre-PegIn tx hex (from indexer). When provided alongside a
   * connected BTC wallet, the modal can transparently re-authenticate
   * with the vault provider on a cold token-registry cache (e.g. after
   * a page reload) by deriving a fresh auth anchor. When omitted, a
   * stale/missing-bearer rejection surfaces to the user as a raw error
   * and they must restart the deposit flow to recover.
   */
  unsignedPrePeginTxHex?: string;
}

export function ArtifactDownloadModal({
  open,
  onClose,
  onComplete,
  providerAddress,
  peginTxid,
  depositorPk,
  vaultId,
  unsignedPrePeginTxHex,
}: ArtifactDownloadModalProps) {
  // Seed from localStorage so a reopened modal for an already-downloaded
  // vault renders the Continue path immediately (the card itself flips to
  // its green "Downloaded" state via the same check). Re-seeded whenever the
  // modal opens against a different vault.
  const [downloaded, setDownloaded] = useState(() =>
    hasArtifactsDownloaded(vaultId),
  );
  // Mirrors RecoveryArtifactsCard's internal `loading` flag via onLoadingChange
  // so the whole modal (title, body, footer button) reads as a single
  // "downloading" state once the user kicks off the request.
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (open) {
      setDownloaded(hasArtifactsDownloaded(vaultId));
      setIsDownloading(false);
    }
  }, [open, vaultId]);

  const cardRef = useRef<RecoveryArtifactsCardHandle>(null);

  // Cancel any in-flight artifact download before the modal unmounts so a
  // dismissed dialog doesn't leave the oversized RPC running in the
  // background (and surprise the user with a file save later).
  const handleClose = () => {
    cardRef.current?.cancel();
    onClose();
  };

  // While a download is in flight the footer button only cancels the
  // download and keeps the modal open (in-place cancel-and-retry): the
  // hook's cancel() resets its state, which flips `isDownloading` back via
  // onLoadingChange and restores the pre-download copy and the card's
  // Download button. Dismissal paths (Escape / backdrop) still go through
  // handleClose.
  const handleCancelDownload = () => {
    cardRef.current?.cancel();
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={handleClose}
      className="w-[564px] max-w-full"
      dialogClassName="!rounded-2xl"
    >
      {/* No header: this inner-flow dialog offers no X — dismissal goes
          through the footer actions (Escape/backdrop still route through
          handleClose via ResponsiveDialog). The top padding stands in for
          the removed header row. */}
      <DialogBody className="flex flex-col items-stretch gap-10 px-6 pb-2 pt-10 text-accent-primary">
        <div className="flex flex-col items-center gap-10">
          <ArtifactModalIcon
            variant={
              downloaded
                ? "downloaded"
                : isDownloading
                  ? "downloading"
                  : "pending"
            }
          />
          <div className="flex w-full flex-col items-center gap-4">
            <h2 className="text-center text-[34px] font-normal leading-[1.235] tracking-[0.25px] text-accent-primary">
              {downloaded
                ? COPY.deposit.artifactDownload.titleDownloaded
                : isDownloading
                  ? COPY.deposit.artifactDownload.titleDownloading
                  : COPY.deposit.artifactDownload.title}
            </h2>
            <p className="text-center text-xl font-normal leading-[1.6] tracking-[0.15px] text-accent-secondary">
              {downloaded
                ? COPY.deposit.artifactDownload.bodyDownloaded
                : isDownloading
                  ? COPY.deposit.artifactDownload.bodyDownloading
                  : COPY.deposit.artifactDownload.body}
            </p>
          </div>
        </div>

        <RecoveryArtifactsCard
          ref={cardRef}
          providerAddress={providerAddress}
          peginTxid={peginTxid}
          depositorPk={depositorPk}
          vaultId={vaultId}
          unsignedPrePeginTxHex={unsignedPrePeginTxHex}
          onDownloaded={() => setDownloaded(true)}
          onLoadingChange={setIsDownloading}
        />
      </DialogBody>

      {/* size="medium" gives the design's 14px label and 16px side padding;
          h-10 restores the design's 40px height over medium's default. */}
      <DialogFooter className="flex flex-row gap-4 px-6 pb-6 pt-4">
        {downloaded ? (
          <>
            <Button
              variant="outlined"
              size="medium"
              className="h-10 flex-1"
              onClick={handleClose}
            >
              {COPY.deposit.artifactDownload.cancelButton}
            </Button>
            <Button
              variant="contained"
              color="secondary"
              size="medium"
              className="h-10 flex-1"
              onClick={onComplete}
            >
              {COPY.deposit.artifactDownload.doneButton}
            </Button>
          </>
        ) : (
          <Button
            variant="outlined"
            size="medium"
            className="h-10 w-full"
            onClick={isDownloading ? handleCancelDownload : handleClose}
          >
            {isDownloading
              ? COPY.deposit.artifactDownload.cancelDownloadButton
              : COPY.deposit.artifactDownload.cancelButton}
          </Button>
        )}
      </DialogFooter>
    </ResponsiveDialog>
  );
}
