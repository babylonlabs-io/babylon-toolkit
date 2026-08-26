import { useCallback, useState } from "react";

import type { VaultActivity } from "@/types/activity";

export function useRefundModal(options: {
  allActivities: VaultActivity[];
  onSuccess: () => void;
}) {
  const { allActivities, onSuccess } = options;

  const [refundingActivity, setRefundingActivity] =
    useState<VaultActivity | null>(null);

  const handleRefundClick = useCallback(
    (depositId: string) => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (activity) {
        setRefundingActivity(activity);
      }
    },
    [allActivities],
  );

  const handleClose = useCallback(() => {
    setRefundingActivity(null);
  }, []);

  const handleSuccess = useCallback(() => {
    setRefundingActivity(null);
    onSuccess();
  }, [onSuccess]);

  return {
    refundingActivity,
    handleRefundClick,
    handleClose,
    handleSuccess,
  };
}
