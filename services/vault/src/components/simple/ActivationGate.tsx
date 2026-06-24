import { type ReactNode, useState } from "react";

import type { VaultActivity } from "@/types/activity";

import { ActivateConfirmationModal } from "./ActivateConfirmationModal";
import { InStepArtifactCallout } from "./InStepArtifactCallout";

interface ActivationGateProps {
  activity: VaultActivity;
  onClose: () => void;
  /** The activation step, rendered only once the user confirms. */
  children: ReactNode;
}

/**
 * Gate before activation: risk acknowledgement → artifact download → proceed.
 */
export function ActivationGate({
  activity,
  onClose,
  children,
}: ActivationGateProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [proceeding, setProceeding] = useState(false);

  if (proceeding) return <>{children}</>;

  if (confirmed) {
    return (
      <InStepArtifactCallout
        vaultId={activity.id}
        providerAddress={activity.providers?.[0]?.id}
        peginTxid={activity.peginTxHash}
        depositorPk={activity.depositorBtcPubkey}
        unsignedPrePeginTxHex={activity.unsignedPrePeginTx}
        onSkip={() => setProceeding(true)}
        onClose={onClose}
      />
    );
  }

  // Always render the confirmation gate (even when the activity is missing
  // any of providerAddress / peginTxid / depositorPk) so the user still
  // sees the risk-acknowledgement checkbox before activating without
  // artifacts. The modal hides the recovery-artifacts card when those
  // fields aren't present and falls back to the acknowledgement-only path.
  return (
    <ActivateConfirmationModal
      open
      vaultId={activity.id}
      providerAddress={activity.providers?.[0]?.id}
      peginTxid={activity.peginTxHash}
      depositorPk={activity.depositorBtcPubkey}
      unsignedPrePeginTxHex={activity.unsignedPrePeginTx}
      onClose={onClose}
      onConfirm={() => setConfirmed(true)}
    />
  );
}
