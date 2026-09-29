import { useCallback, useState } from "react";

import type { VaultActivity } from "@/types/activity";

interface WithdrawingState {
  activity: VaultActivity;
}

export function useEmergencyWithdrawModal(options: {
  allActivities: VaultActivity[];
  onSuccess: () => void;
}) {
  const { allActivities, onSuccess } = options;

  const [withdrawing, setWithdrawing] = useState<WithdrawingState | null>(null);

  const handleWithdrawClick = useCallback(
    (depositId: string) => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (activity) {
        setWithdrawing({ activity });
      }
    },
    [allActivities],
  );

  const handleClose = useCallback(() => {
    setWithdrawing(null);
  }, []);

  const handleSuccess = useCallback(() => {
    setWithdrawing(null);
    onSuccess();
  }, [onSuccess]);

  return {
    withdrawing,
    handleWithdrawClick,
    handleClose,
    handleSuccess,
  };
}
