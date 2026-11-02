import {
  Button,
  ConfirmationDialog,
  DialogBody,
  DialogFooter,
  ResponsiveDialog,
  useIsMobile,
} from "@babylonlabs-io/core-ui";
import { useEffect, useRef, useState } from "react";
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
  error: null,
};

interface ArtifactDownloadModalProps extends ArtifactDownloadParams {
  onClose: () => void;
}

/** Download artifacts for an active vault or a vault that expired after Verified. */
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
  const [cancelAction, setCancelAction] = useState<"close" | "cancel" | null>(
    null,
  );

  useEffect(() => {
    if (!isDownloading) setCancelAction(null);
  }, [isDownloading]);

  const cardRef = useRef<RecoveryArtifactsCardHandle>(null);

  const handleClose = () => {
    if (isDownloading) setCancelAction("close");
    else onClose();
  };

  const confirmCancelDownload = () => {
    if (isDownloading) {
      cardRef.current?.cancel();
      if (cancelAction === "close") onClose();
    }
    setCancelAction(null);
  };

  const isMobile = useIsMobile();

  return (
    <ResponsiveDialog
      open
      onClose={isDownloading ? undefined : handleClose}
      className="w-[600px] max-w-full"
      dialogClassName="!rounded-2xl !bg-background-contrast"
    >
      {(!isMobile || isDownloading) && (
        <div
          className={
            isMobile ? "absolute left-4 top-4 z-10" : "flex justify-end"
          }
        >
          <button
            type="button"
            onClick={handleClose}
            aria-label={COPY.common.close}
            data-testid="artifact-download-modal-close"
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
            onClick={() => setCancelAction("cancel")}
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
      <ConfirmationDialog
        open={isDownloading && cancelAction !== null}
        onClose={() => setCancelAction(null)}
        title={COPY.deposit.recoveryArtifacts.cancelConfirmation.title}
        description={COPY.deposit.recoveryArtifacts.cancelConfirmation.body}
        primaryAction={{
          label: COPY.deposit.recoveryArtifacts.cancelConfirmation.keepButton,
          onClick: () => setCancelAction(null),
        }}
        secondaryAction={{
          label: COPY.deposit.recoveryArtifacts.cancelConfirmation.cancelButton,
          onClick: confirmCancelDownload,
        }}
      />
    </ResponsiveDialog>
  );
}
