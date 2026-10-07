import {
  Button,
  DialogBody,
  DialogFooter,
  ResponsiveDialog,
  WINDOW_BREAKPOINT,
  useIsMobile,
} from "@babylonlabs-io/core-ui";
import { useRef, useState } from "react";
import { IoClose } from "react-icons/io5";
import { twJoin } from "tailwind-merge";

import { ArtifactDownloadContent } from "@/components/deposit/ArtifactDownloadContent";
import { ArtifactModalIcon } from "@/components/deposit/ArtifactModalIcon";
import {
  RecoveryArtifactsCard,
  type ArtifactDownloadProgress,
  type RecoveryArtifactsCardHandle,
} from "@/components/deposit/RecoveryArtifactsCard";
import { COPY } from "@/copy";
import type { ArtifactDownloadParams } from "@/utils/artifactDownloadParams";
import { hasArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

const IDLE_DOWNLOAD_STATE: ArtifactDownloadProgress = {
  loading: false,
  receivedBytes: 0,
  totalBytes: 0,
  status: "",
};

interface ArtifactDownloadModalProps extends ArtifactDownloadParams {
  onClose: () => void;
}

/**
 * Standalone artifact download for a vault that is already active. Mounted
 * per vault by its parent, so the downloaded state seeds once from storage.
 */
export function ArtifactDownloadModal({
  onClose,
  vaultId,
  providerAddress,
  peginTxid,
  depositorPk,
  unsignedPrePeginTxHex,
}: ArtifactDownloadModalProps) {
  const [downloaded, setDownloaded] = useState(() =>
    hasArtifactsDownloaded(vaultId, peginTxid),
  );
  const [downloadState, setDownloadState] =
    useState<ArtifactDownloadProgress>(IDLE_DOWNLOAD_STATE);
  const isDownloading = downloadState.loading;

  const cardRef = useRef<RecoveryArtifactsCardHandle>(null);

  // Cancel any in-flight download so a dismissed dialog does not leave the
  // oversized RPC running and surprise the user with a file save later.
  const handleClose = () => {
    cardRef.current?.cancel();
    onClose();
  };

  // While a download is in flight the footer button only cancels it and keeps
  // the modal open; the hook's cancel() resets its state, which restores the
  // download step.
  const handleCancelDownload = () => {
    cardRef.current?.cancel();
  };

  const isMobile = useIsMobile(WINDOW_BREAKPOINT);

  return (
    <ResponsiveDialog
      open
      onClose={handleClose}
      className="w-[600px] max-w-full"
      dialogClassName="!rounded-2xl !bg-background-contrast"
    >
      {!isMobile && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            aria-label={COPY.common.close}
            className="flex size-10 items-center justify-center text-accent-primary"
          >
            <IoClose size={24} />
          </button>
        </div>
      )}
      <DialogBody
        className={twJoin(
          "flex flex-col items-stretch gap-8 text-accent-primary",
          isMobile && "px-6 pb-2 pt-10",
        )}
      >
        {isDownloading ? (
          <ArtifactDownloadContent
            receivedBytes={downloadState.receivedBytes}
            totalBytes={downloadState.totalBytes}
            status={downloadState.status}
          />
        ) : (
          <div className="flex flex-col items-center gap-6">
            <ArtifactModalIcon
              variant={downloaded ? "downloaded" : "pending"}
            />
            <div className="flex w-full flex-col items-center gap-6">
              <h2 className="text-center text-[34px] font-normal leading-[1.235] tracking-[0.25px] text-accent-primary">
                {downloaded
                  ? COPY.deposit.artifactDownload.titleDownloaded
                  : COPY.deposit.artifactDownload.title}
              </h2>
              <p className="text-center text-xl font-normal leading-[1.6] tracking-[0.15px] text-accent-secondary">
                {downloaded
                  ? COPY.deposit.artifactDownload.bodyDownloaded
                  : COPY.deposit.artifactDownload.body}
              </p>
            </div>
          </div>
        )}

        <div hidden={isDownloading}>
          <RecoveryArtifactsCard
            ref={cardRef}
            providerAddress={providerAddress}
            peginTxid={peginTxid}
            depositorPk={depositorPk}
            vaultId={vaultId}
            unsignedPrePeginTxHex={unsignedPrePeginTxHex}
            onDownloaded={() => setDownloaded(true)}
            onStateChange={setDownloadState}
            context="vault"
          />
        </div>
      </DialogBody>

      {/* size="medium" gives the design's 14px label and 16px side padding;
          h-10 restores the design's 40px height over medium's default. */}
      <DialogFooter
        className={twJoin(
          "flex flex-row gap-4",
          isDownloading ? "pt-10" : "pt-4",
          isMobile && "px-6 pb-6",
        )}
      >
        {isDownloading ? (
          <Button
            variant="outlined"
            size="medium"
            className="h-10 flex-1 rounded-lg"
            onClick={handleCancelDownload}
          >
            {COPY.deposit.artifactDownload.cancelDownloadButton}
          </Button>
        ) : downloaded ? (
          <>
            <Button
              variant="outlined"
              size="medium"
              className="h-10 flex-1 rounded-lg"
              onClick={handleClose}
            >
              {COPY.deposit.artifactDownload.cancelButton}
            </Button>
            <Button
              variant="contained"
              color="secondary"
              size="medium"
              className="h-10 flex-1 rounded-lg"
              onClick={handleClose}
            >
              {COPY.deposit.artifactDownload.doneButton}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outlined"
              size="medium"
              className="h-10 flex-1 rounded-lg"
              onClick={handleClose}
            >
              {COPY.deposit.artifactDownload.cancelButton}
            </Button>
            <Button
              variant="contained"
              color="secondary"
              size="medium"
              className="h-10 flex-1 rounded-lg"
              onClick={() => cardRef.current?.download()}
            >
              {COPY.deposit.activateConfirmation.downloadButton}
            </Button>
          </>
        )}
      </DialogFooter>
    </ResponsiveDialog>
  );
}
