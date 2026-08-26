import { useCallback, useMemo, useState } from "react";

import type { VaultActivity } from "../../types/activity";
import { getBatchSiblings } from "../../utils/batchedPegin";
import { formatBtcValue } from "../../utils/formatting";

/**
 * Hook to manage broadcast modal state and actions
 *
 * Provides state and callbacks for opening/closing the broadcast modal
 * and handling successful broadcast submission.
 *
 * A batched pegin shares one Pre-PegIn transaction across vaults, so a
 * broadcast commits the whole batch. The modal therefore tracks every
 * sibling: `broadcastingActivity` is the representative vault driving the
 * resume UI, `broadcastingBatchIds` are all vaults the broadcast confirms.
 */
export function useBroadcastModal(options: {
  allActivities: VaultActivity[];
  onSuccess: () => void;
}) {
  const { allActivities, onSuccess } = options;

  const [broadcastingBatch, setBroadcastingBatch] = useState<
    VaultActivity[] | null
  >(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successAmount, setSuccessAmount] = useState("");

  // Handle clicking "Broadcast" button from a deposit card or batch group
  const handleBroadcastClick = useCallback(
    (depositId: string) => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (!activity) return;
      // Resolve every sibling sharing this Pre-PegIn tx — broadcasting it
      // commits all of them. A standalone deposit resolves to one vault.
      setBroadcastingBatch(getBatchSiblings(allActivities, activity));
    },
    [allActivities],
  );

  // Handle broadcast modal close
  const handleClose = useCallback(() => {
    setBroadcastingBatch(null);
  }, []);

  // Handle broadcast success
  const handleSuccess = useCallback(() => {
    const totalBtc = (broadcastingBatch ?? []).reduce(
      (sum, a) => sum + parseFloat(a.collateral.amount || "0"),
      0,
    );
    setSuccessAmount(formatBtcValue(totalBtc));
    setBroadcastingBatch(null);
    setSuccessOpen(true);
    onSuccess();
  }, [broadcastingBatch, onSuccess]);

  // Handle success modal close
  const handleSuccessClose = useCallback(() => {
    setSuccessOpen(false);
  }, []);

  const broadcastingBatchIds = useMemo(
    () => broadcastingBatch?.map((a) => a.id) ?? [],
    [broadcastingBatch],
  );

  return {
    broadcastingActivity: broadcastingBatch?.[0] ?? null,
    broadcastingBatchIds,
    isOpen: !!broadcastingBatch,
    successOpen,
    successAmount,
    handleBroadcastClick,
    handleClose,
    handleSuccess,
    handleSuccessClose,
  };
}
