import { type ReactNode, useState } from "react";

import { ArtifactDownloadModal } from "@/components/deposit/ArtifactDownloadModal";
import type { VaultActivity } from "@/types/activity";
import { hasArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

import { ActivateConfirmationModal } from "./ActivateConfirmationModal";

interface ActivationGateProps {
  activity: VaultActivity;
  onClose: () => void;
  /** The activation step, rendered only once the user confirms. */
  children: ReactNode;
}

export function ActivationGate({
  activity,
  onClose,
  children,
}: ActivationGateProps) {
  const providerAddress = activity.providers?.[0]?.id;
  const peginTxid = activity.peginTxHash;
  const depositorPk = activity.depositorBtcPubkey;
  const artifacts =
    providerAddress && peginTxid && depositorPk
      ? { providerAddress, peginTxid, depositorPk }
      : null;

  const [confirmed, setConfirmed] = useState(false);
  const [downloadCompletedAt, setDownloadCompletedAt] = useState(0);
  // Auto-open the download modal on first mount when artifacts haven't been
  // downloaded yet for this vault, so the user can't blow past the artifact
  // prompt without seeing it. Dismissing falls through to the confirmation gate.
  const [showArtifactDownload, setShowArtifactDownload] = useState(
    () => !!artifacts && !hasArtifactsDownloaded(activity.id),
  );

  if (confirmed) return <>{children}</>;

  return (
    <>
      {!showArtifactDownload && (
        <ActivateConfirmationModal
          open
          vaultId={activity.id}
          downloadCompletedAt={downloadCompletedAt}
          onClose={onClose}
          onConfirm={() => setConfirmed(true)}
          onDownloadArtifacts={() => {
            if (artifacts) setShowArtifactDownload(true);
          }}
        />
      )}

      {showArtifactDownload && artifacts && (
        <ArtifactDownloadModal
          open
          providerAddress={artifacts.providerAddress}
          peginTxid={artifacts.peginTxid}
          depositorPk={artifacts.depositorPk}
          vaultId={activity.id}
          unsignedPrePeginTxHex={activity.unsignedPrePeginTx}
          onClose={() => setShowArtifactDownload(false)}
          onComplete={() => {
            setShowArtifactDownload(false);
            setDownloadCompletedAt((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
