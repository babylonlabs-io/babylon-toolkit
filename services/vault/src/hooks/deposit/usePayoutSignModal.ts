import { useCallback, useState } from "react";

import type {
  ClaimerTransactions,
  DepositorGraphTransactions,
} from "../../clients/vault-provider-rpc/types";
import type { VaultActivity } from "../../types/activity";

/** Data for an active signing session — all fields set together */
export interface SignModalData {
  activity: VaultActivity;
  transactions: ClaimerTransactions[];
  depositorGraph: DepositorGraphTransactions;
}

/**
 * Hook to manage payout sign modal state and actions
 *
 * Uses a single state object so that activity, transactions, and
 * depositorGraph are always set/cleared atomically.
 */
export function usePayoutSignModal(options: {
  allActivities: VaultActivity[];
  onSuccess: () => void;
}) {
  const { allActivities, onSuccess } = options;

  const [signingData, setSigningData] = useState<SignModalData | null>(null);

  // Handle clicking "Sign" button from table row
  const handleSignClick = useCallback(
    (
      depositId: string,
      transactions: ClaimerTransactions[],
      depositorGraph: DepositorGraphTransactions,
    ) => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (activity && transactions) {
        setSigningData({ activity, transactions, depositorGraph });
      }
    },
    [allActivities],
  );

  // Handle payout sign modal close
  const handleClose = useCallback(() => {
    setSigningData(null);
  }, []);

  // Handle payout sign success
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
