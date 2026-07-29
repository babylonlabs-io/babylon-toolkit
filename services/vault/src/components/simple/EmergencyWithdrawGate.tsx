import { type ReactNode, useState } from "react";

import { EmergencyWithdrawConfirmationModal } from "./EmergencyWithdrawConfirmationModal";

interface EmergencyWithdrawGateProps {
  /** True when the stuck state was detected on-chain — drives the modal body. */
  stuckStateDetected: boolean;
  onClose: () => void;
  /** The withdraw step, rendered only once the user confirms. */
  children: ReactNode;
}

/**
 * Gate before the activate-and-redeem escape hatch: explicit risk
 * acknowledgement → proceed. Mirrors ActivationGate — the withdraw step
 * auto-runs the secret derivation on mount, so it must never render before
 * the user has confirmed the irreversible reveal.
 */
export function EmergencyWithdrawGate({
  stuckStateDetected,
  onClose,
  children,
}: EmergencyWithdrawGateProps) {
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) return <>{children}</>;

  return (
    <EmergencyWithdrawConfirmationModal
      open
      stuckStateDetected={stuckStateDetected}
      onClose={onClose}
      onConfirm={() => setConfirmed(true)}
    />
  );
}
