import { useCallback, useState } from "react";

import type { VaultActivity } from "../../types/activity";

/**
 * Hook to manage broadcast modal state and actions
 *
 * Provides state and callbacks for opening/closing the broadcast modal
 * and handling successful broadcast submission.
 */
export function useBroadcastModal(options: {
  allActivities: VaultActivity[];
  onSuccess: () => void;
}) {
  const { allActivities, onSuccess } = options;

  const [broadcastingActivity, setBroadcastingActivity] =
    useState<VaultActivity | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successAmount, setSuccessAmount] = useState("");

  // Handle clicking "Broadcast" button from table row
  const handleBroadcastClick = useCallback(
    (depositId: string) => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (activity) {
        setBroadcastingActivity(activity);
      }
    },
    [allActivities],
  );

  // Handle broadcast modal close
  const handleClose = useCallback(() => {
    setBroadcastingActivity(null);
  }, []);

  // Handle broadcast success
  const handleSuccess = useCallback(() => {
    setSuccessAmount(broadcastingActivity?.collateral.amount || "");
    setBroadcastingActivity(null);
    setSuccessOpen(true);
    onSuccess();
  }, [broadcastingActivity, onSuccess]);

  // Handle success modal close
  const handleSuccessClose = useCallback(() => {
    setSuccessOpen(false);
  }, []);

  return {
    broadcastingActivity,
    isOpen: !!broadcastingActivity,
    successOpen,
    successAmount,
    handleBroadcastClick,
    handleClose,
    handleSuccess,
    handleSuccessClose,
  };
}
