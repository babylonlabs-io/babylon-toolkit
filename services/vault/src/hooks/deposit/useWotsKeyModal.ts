import { useCallback, useState } from "react";

import type { VaultActivity } from "../../types/activity";

export function useWotsKeyModal(options: {
  allActivities: VaultActivity[];
  onSuccess: () => void;
}) {
  const { allActivities, onSuccess } = options;

  const [activity, setActivity] = useState<VaultActivity | null>(null);

  const handleWotsKeyClick = useCallback(
    (depositId: string) => {
      const found = allActivities.find((a) => a.id === depositId);
      if (found) {
        setActivity(found);
      }
    },
    [allActivities],
  );

  const handleClose = useCallback(() => {
    setActivity(null);
  }, []);

  // Refetches activities without closing the modal. The WOTS resume
  // flow parks on a "Close & continue later" state after submission, so
  // the modal stays mounted until the user explicitly dismisses via
  // handleClose.
  const handleSuccess = useCallback(() => {
    onSuccess();
  }, [onSuccess]);

  return {
    activity,
    isOpen: !!activity,
    handleWotsKeyClick,
    handleClose,
    handleSuccess,
  };
}
