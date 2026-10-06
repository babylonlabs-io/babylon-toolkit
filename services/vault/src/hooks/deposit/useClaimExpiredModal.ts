import { useCallback, useState } from "react";

import type { VaultActivity } from "@/types/activity";

export function useClaimExpiredModal(options: {
  allActivities: VaultActivity[];
  onSuccess: () => void;
}) {
  const { allActivities, onSuccess } = options;

  const [claimingActivity, setClaimingActivity] =
    useState<VaultActivity | null>(null);

  const handleClaimClick = useCallback(
    (depositId: string) => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (activity) {
        setClaimingActivity(activity);
      }
    },
    [allActivities],
  );

  const handleClose = useCallback(() => {
    setClaimingActivity(null);
  }, []);

  const handleSuccess = useCallback(() => {
    setClaimingActivity(null);
    onSuccess();
  }, [onSuccess]);

  return {
    claimingActivity,
    handleClaimClick,
    handleClose,
    handleSuccess,
  };
}
