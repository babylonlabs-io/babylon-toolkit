import { useCallback, useState } from "react";

import type { VaultActivity } from "@/types/activity";

interface WithdrawingState {
  activity: VaultActivity;
  /**
   * True when the stuck state was detected on-chain (HTLC spent while the
   * vault is still Verified) — the modal explains what happened. False when
   * the user opted in via the activation dialog's advanced link — the modal
   * warns that waiting for expiry + refund is the safe default.
   */
  stuckStateDetected: boolean;
}

export function useEmergencyWithdrawModal(options: {
  allActivities: VaultActivity[];
  onSuccess: () => void;
}) {
  const { allActivities, onSuccess } = options;

  const [withdrawing, setWithdrawing] = useState<WithdrawingState | null>(null);

  const handleWithdrawClick = useCallback(
    (depositId: string, source: "detected" | "advanced") => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (activity) {
        setWithdrawing({
          activity,
          stuckStateDetected: source === "detected",
        });
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
