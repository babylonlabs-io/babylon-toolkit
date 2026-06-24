import { Button } from "@babylonlabs-io/core-ui";
import { useState } from "react";
import { IoDocumentText } from "react-icons/io5";
import type { Hex } from "viem";

import { ArtifactDownloadModal } from "@/components/deposit/ArtifactDownloadModal";
import { COPY } from "@/copy";
import { hasArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

interface InStepArtifactCalloutProps {
  vaultId: Hex;
  providerAddress?: string;
  peginTxid?: string;
  depositorPk?: string;
  unsignedPrePeginTxHex?: string;
  onSkip: () => void;
  onClose: () => void;
}

export function InStepArtifactCallout({
  vaultId,
  providerAddress,
  peginTxid,
  depositorPk,
  unsignedPrePeginTxHex,
  onSkip,
  onClose,
}: InStepArtifactCalloutProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const alreadyDownloaded = hasArtifactsDownloaded(vaultId);
  const canDownload = Boolean(providerAddress && peginTxid && depositorPk);

  const handleDownloadComplete = () => {
    setModalOpen(false);
    // After download, proceed to activation (like Skip)
    onSkip();
  };

  const handleModalClose = () => {
    setModalOpen(false);
    // Stay on the callout so the user can still Skip
  };

  return (
    <>
      <div className="flex flex-col items-stretch gap-6 rounded-2xl border border-secondary-strokeLight bg-neutral-100 p-6">
        {/* Header: icon + file name + (Recommended) */}
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-200 text-accent-primary">
            <IoDocumentText size={24} />
          </div>
          <div className="flex flex-col items-start gap-1 min-w-0">
            <span className="text-lg font-medium leading-[1.4] tracking-[0.15px] text-accent-primary">
              {COPY.deposit.inStepArtifact.fileName}
            </span>
            <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
              {COPY.deposit.inStepArtifact.recommended}
            </span>
          </div>
        </div>

        {/* Actions: Skip + Download */}
        <div className="flex gap-3">
          <Button
            variant="outlined"
            className="h-10 flex-1"
            onClick={onSkip}
          >
            {COPY.deposit.inStepArtifact.skip}
          </Button>
          <Button
            variant={alreadyDownloaded ? "contained" : "outlined"}
            className="h-10 flex-1"
            disabled={!canDownload}
            onClick={() => setModalOpen(true)}
          >
            {alreadyDownloaded
              ? COPY.deposit.recoveryArtifacts.downloadedLabel
              : COPY.deposit.inStepArtifact.download}
          </Button>
        </div>
      </div>

      {modalOpen && canDownload && (
        <ArtifactDownloadModal
          open={modalOpen}
          onClose={handleModalClose}
          onComplete={handleDownloadComplete}
          vaultId={vaultId}
          providerAddress={providerAddress as string}
          peginTxid={peginTxid as string}
          depositorPk={depositorPk as string}
          unsignedPrePeginTxHex={unsignedPrePeginTxHex}
        />
      )}
    </>
  );
}
