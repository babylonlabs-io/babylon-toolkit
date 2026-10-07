import { type ReactNode, useState } from "react";

import type { VaultActivity } from "@/types/activity";

import { ActivateConfirmationModal } from "./ActivateConfirmationModal";

interface ActivationGateProps {
  activity: VaultActivity;
  onClose: () => void;
  /** The activation step, rendered only once the user confirms. */
  children: ReactNode;
  /**
   * God-mode demo vaults only: their synthetic provider can never answer the
   * modal's liveness probe, so the verdict is simulated as reachable.
   */
  simulatedProvider?: boolean;
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
  simulatedProvider = false,
}: ActivationGateProps) {
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) return <>{children}</>;

  // Always render the confirmation gate, even when the activity is missing
  // any of providerAddress / peginTxid / depositorPk: the modal then shows
  // "Deposit details incomplete" with Cancel only, so the user learns why
  // activation is held instead of silently getting no gate at all.
  return (
    <ActivateConfirmationModal
      open
      vaultId={activity.id}
      providerAddress={activity.providers?.[0]?.id}
      peginTxid={activity.peginTxHash}
      depositorPk={activity.depositorBtcPubkey}
      unsignedPrePeginTxHex={activity.unsignedPrePeginTx}
      simulateProviderLiveness={simulatedProvider}
      onClose={onClose}
      onConfirm={() => setConfirmed(true)}
    />
  );
}
