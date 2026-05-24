import { type ReactNode, useState } from "react";

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

  if (confirmed) return <>{children}</>;

  const providerAddress = activity.providers?.[0]?.id;
  const peginTxid = activity.peginTxHash;
  const depositorPk = activity.depositorBtcPubkey;

  // Activity arriving without these fields cannot be activated either:
  // proceed to the activation step (children) so any downstream error
  // surfaces in the activation flow rather than blocking the user on a
  // disabled gate they can't recover from.
  if (!providerAddress || !peginTxid || !depositorPk) {
    return <>{children}</>;
  }

  return (
    <ActivateConfirmationModal
      open
      vaultId={activity.id}
      providerAddress={providerAddress}
      peginTxid={peginTxid}
      depositorPk={depositorPk}
      unsignedPrePeginTxHex={activity.unsignedPrePeginTx}
      onClose={onClose}
      onConfirm={() => setConfirmed(true)}
    />
  );
}
