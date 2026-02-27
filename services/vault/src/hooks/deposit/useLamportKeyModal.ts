import { useCallback, useState } from "react";

import type { VaultActivity } from "../../types/activity";

export function useLamportKeyModal(options: {
  allActivities: VaultActivity[];
  onSuccess: () => void;
}) {
  const { allActivities, onSuccess } = options;

  const [activity, setActivity] = useState<VaultActivity | null>(null);

  const handleLamportKeyClick = useCallback(
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

  const handleSuccess = useCallback(() => {
    setActivity(null);
    onSuccess();
  }, [onSuccess]);

  return {
    activity,
    isOpen: !!activity,
    handleLamportKeyClick,
    handleClose,
    handleSuccess,
  };
}
