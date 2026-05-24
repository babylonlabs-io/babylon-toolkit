import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  ResponsiveDialog,
} from "@babylonlabs-io/core-ui";
import { useEffect, useRef, useState } from "react";
import type { Hex } from "viem";

import {
  RecoveryArtifactsCard,
  type RecoveryArtifactsCardHandle,
} from "@/components/deposit/RecoveryArtifactsCard";
import { COPY } from "@/copy";
import { hasArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

interface ArtifactDownloadModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  providerAddress: string;
  peginTxid: string;
  depositorPk: string;
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

  useEffect(() => {
    if (open) setDownloaded(hasArtifactsDownloaded(vaultId));
  }, [open, vaultId]);

  const cardRef = useRef<RecoveryArtifactsCardHandle>(null);

  // Cancel any in-flight artifact download before the modal unmounts so a
  // dismissed dialog doesn't leave the oversized RPC running in the
  // background (and surprise the user with a file save later).
  const handleClose = () => {
    cardRef.current?.cancel();
    onClose();
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={handleClose}
      className="w-[564px] max-w-full"
      dialogClassName="!rounded-2xl"
    >
      <DialogHeader
        title=""
        onClose={handleClose}
        // Float the close (×) button at the top-right with no border, so the
        // title row sits absolutely over the body padding (matches the design).
        className="text-accent-primary [&_.bbn-dialog-title]:!absolute [&_.bbn-dialog-title]:!right-5 [&_button]:!border-0"
      />

      <DialogBody className="flex flex-col items-stretch gap-10 px-6 pb-2 pt-2 text-accent-primary">
        <div className="flex flex-col items-center gap-10">
          <svg
            width="90"
            height="90"
            viewBox="0 0 90 90"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-accent-primary"
            aria-hidden="true"
          >
            <path
              d="M75 43.125V26.25L58.125 7.5H18.75C16.6789 7.5 15 9.17893 15 11.25V78.75C15 80.8211 16.6789 82.5 18.75 82.5H41.25"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M50.625 58.5C50.625 56.4999 63.75 52.5 63.75 52.5C63.75 52.5 76.875 56.4999 76.875 58.5C76.875 74.4999 63.75 82.5 63.75 82.5C63.75 82.5 50.625 74.4999 50.625 58.5Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M56.25 7.5V26.25H75"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="flex w-full flex-col items-center gap-4">
            <h2 className="text-center text-[34px] font-normal leading-[1.235] tracking-[0.25px] text-accent-primary">
              {COPY.deposit.artifactDownload.title}
            </h2>
            <p className="text-center text-xl font-normal leading-[1.6] tracking-[0.15px] text-accent-secondary">
              {COPY.deposit.artifactDownload.body}
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
        />
      </DialogBody>

      <DialogFooter className="flex flex-row gap-4 px-6 pb-6 pt-4">
        <Button
          variant={downloaded ? "contained" : "outlined"}
          className="h-10 w-full"
          onClick={downloaded ? onComplete : handleClose}
        >
          {downloaded
            ? COPY.deposit.artifactDownload.continueButton
            : COPY.deposit.artifactDownload.cancelButton}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
