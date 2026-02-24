import { useCallback, useState } from "react";

import type { VaultActivity } from "../../types/activity";

/**
 * Hook to manage payout sign modal state and actions
 *
 * Provides state and callbacks for opening/closing the payout sign modal
 * and handling successful payout signature submission.
 */
export function usePayoutSignModal(options: {
  allActivities: VaultActivity[];
  onSuccess: () => void;
}) {
  const { allActivities, onSuccess } = options;

  const [signingActivity, setSigningActivity] = useState<VaultActivity | null>(
    null,
  );
  const [signingTransactions, setSigningTransactions] = useState<any[] | null>(
    null,
  );

  // Handle clicking "Sign" button from table row
  const handleSignClick = useCallback(
    (depositId: string, transactions: any[]) => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (activity && transactions) {
        setSigningActivity(activity);
        setSigningTransactions(transactions);
      }
    },
    [allActivities],
  );

  // Handle payout sign modal close
  const handleClose = useCallback(() => {
    setSigningActivity(null);
    setSigningTransactions(null);
  }, []);

  // Handle payout sign success
  const handleSuccess = useCallback(() => {
    onSuccess();
  }, [onSuccess]);

  return {
    signingActivity,
    signingTransactions,
    isOpen: !!signingActivity,
    handleSignClick,
    handleClose,
    handleSuccess,
  };
}
