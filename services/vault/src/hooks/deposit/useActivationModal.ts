import { useCallback, useState } from "react";

import type { VaultActivity } from "../../types/activity";

/**
 * Hook to manage activation modal state and actions.
 *
 * The success banner now lives inside the modal itself (DepositProgressView),
 * so this hook just tracks which activity is being activated and forwards
 * the dismiss + refetch on the user's "Done" click.
 */
export function useActivationModal(options: {
  allActivities: VaultActivity[];
  onSuccess: () => void;
}) {
  const { allActivities, onSuccess } = options;

  const [activatingActivity, setActivatingActivity] =
    useState<VaultActivity | null>(null);

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
    onSuccess();
  }, [onSuccess]);

  return {
    activatingActivity,
    isOpen: !!activatingActivity,
    handleActivationClick,
    handleClose,
    handleSuccess,
  };
}
