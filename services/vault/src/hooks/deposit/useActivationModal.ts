import { useCallback, useState } from "react";

import type { VaultActivity } from "../../types/activity";

/**
 * Hook to manage activation modal state and actions
 *
 * Provides state and callbacks for opening/closing the activation modal
 * and handling successful vault activation.
 */
export function useActivationModal(options: {
  allActivities: VaultActivity[];
  onSuccess: () => void;
}) {
  const { allActivities, onSuccess } = options;

  const [activatingActivity, setActivatingActivity] =
    useState<VaultActivity | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const handleActivationClick = useCallback(
    (depositId: string) => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (activity) {
        setActivatingActivity(activity);
      }
    },
    [allActivities],
  );

  const handleClose = useCallback(() => {
    setActivatingActivity(null);
  }, []);

  const handleSuccess = useCallback(() => {
    setActivatingActivity(null);
    setSuccessOpen(true);
    onSuccess();
  }, [onSuccess]);

  const handleSuccessClose = useCallback(() => {
    setSuccessOpen(false);
  }, []);

  return {
    activatingActivity,
    isOpen: !!activatingActivity,
    successOpen,
    handleActivationClick,
    handleClose,
    handleSuccess,
    handleSuccessClose,
  };
}
