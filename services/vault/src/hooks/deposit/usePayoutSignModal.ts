import { useCallback, useState } from "react";

import type { VaultActivity } from "../../types/activity";

/** Data for an active signing session. */
export interface SignModalData {
  activity: VaultActivity;
}

/**
 * Hook to manage payout sign modal state and actions.
 *
 * The actual transactions + depositor graph are fetched by the SDK's
 * `pollAndSignPayouts` (via the modal's hook) — the modal only needs to
 * know which activity is being signed.
 */
export function usePayoutSignModal(options: {
  allActivities: VaultActivity[];
  onSuccess: () => void;
}) {
  const { allActivities, onSuccess } = options;

  const [signingData, setSigningData] = useState<SignModalData | null>(null);

  const handleSignClick = useCallback(
    (depositId: string) => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (activity) {
        setSigningData({ activity });
      }
    },
    [allActivities],
  );

  const handleClose = useCallback(() => {
    setSigningData(null);
  }, []);

  const handleSuccess = useCallback(() => {
    onSuccess();
  }, [onSuccess]);

  return {
    signingData,
    handleSignClick,
    handleClose,
    handleSuccess,
  };
}
