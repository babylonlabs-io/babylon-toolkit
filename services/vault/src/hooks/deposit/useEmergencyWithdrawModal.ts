import { useCallback, useState } from "react";

import type { WithdrawStuckProof } from "@/components/deposit/EmergencyWithdrawModal/stuckProof";
import type { VaultActivity } from "@/types/activity";
import { isWithdrawRemovingSplitProtection } from "@/utils/batchedPegin";

interface WithdrawingState {
  activity: VaultActivity;
  /** Stated by the opener, never derived here: it selects the dialog's text only. */
  stuckProof: WithdrawStuckProof;
}

export function useEmergencyWithdrawModal(options: {
  allActivities: VaultActivity[];
  onSuccess: () => void;
}) {
  const { allActivities, onSuccess } = options;

  const [withdrawing, setWithdrawing] = useState<WithdrawingState | null>(null);

  const handleWithdrawClick = useCallback(
    (activity: VaultActivity, stuckProof: WithdrawStuckProof) => {
      setWithdrawing({ activity, stuckProof });
    },
    [],
  );

  const handleClose = useCallback(() => {
    setWithdrawing(null);
  }, []);

  const handleSuccess = useCallback(() => {
    setWithdrawing(null);
    onSuccess();
  }, [onSuccess]);

  // Read from the latest list so the warning follows the sibling's status.
  const splitProtectionLost =
    withdrawing !== null &&
    isWithdrawRemovingSplitProtection(allActivities, withdrawing.activity);

  return {
    withdrawing,
    splitProtectionLost,
    handleWithdrawClick,
    handleClose,
    handleSuccess,
  };
}
