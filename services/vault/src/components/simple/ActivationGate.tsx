import { type ReactNode, useState } from "react";

import type { VaultActivity } from "@/types/activity";

import { ActivateConfirmationModal } from "./ActivateConfirmationModal";

interface ActivationGateProps {
  activity: VaultActivity;
  onClose: () => void;
  /** The activation step, rendered only once the user confirms. */
  children: ReactNode;
}

/**
 * Gate before activation: artifact download / risk acknowledgement →
 * proceed. The confirmation modal owns the whole pre-activation flow
 * (download with progress, or explicit risk acknowledgement), so confirming
 * goes straight to the activation step.
 */
export function ActivationGate({
  activity,
  onClose,
  children,
}: ActivationGateProps) {
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) return <>{children}</>;

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
