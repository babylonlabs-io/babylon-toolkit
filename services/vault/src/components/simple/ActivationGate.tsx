import { type ReactNode, useState } from "react";

import { ArtifactDownloadModal } from "@/components/deposit/ArtifactDownloadModal";
import type { VaultActivity } from "@/types/activity";

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
  const [confirmed, setConfirmed] = useState(false);
  const [showArtifactDownload, setShowArtifactDownload] = useState(false);
  const [downloadCompletedAt, setDownloadCompletedAt] = useState(0);

  if (confirmed) return <>{children}</>;

  const providerAddress = activity.providers?.[0]?.id;
  const peginTxid = activity.peginTxHash;
  const depositorPk = activity.depositorBtcPubkey;
  const artifacts =
    providerAddress && peginTxid && depositorPk
      ? { providerAddress, peginTxid, depositorPk }
      : null;

  return (
    <>
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
