import { useCallback, useMemo, useState } from "react";

import type { VaultActivity } from "../../types/activity";
import { getBatchSiblings } from "../../utils/batchedPegin";
import { formatBtcValue } from "../../utils/formatting";

/** What the broadcast modal was opened on. */
interface OpenBroadcast {
  /** The vault driving the resume UI. Fixed while the modal is open. */
  representative: VaultActivity;
  /** Every sibling as listed when the modal opened. */
  batchAtOpen: VaultActivity[];
}

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

  const [openBroadcast, setOpenBroadcast] = useState<OpenBroadcast | null>(
    null,
  );
  const [successOpen, setSuccessOpen] = useState(false);
  const [successAmount, setSuccessAmount] = useState("");

  // Handle clicking "Broadcast" button from a deposit card or batch group
  const handleBroadcastClick = useCallback(
    (depositId: string) => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (!activity) return;
      // Resolve every sibling sharing this Pre-PegIn tx — broadcasting it
      // commits all of them. A standalone deposit resolves to one vault.
      const batch = getBatchSiblings(allActivities, activity);
      setOpenBroadcast({ representative: batch[0], batchAtOpen: batch });
    },
    [allActivities],
  );

  // Re-read the batch from the latest list on every update, so each attempt
  // (Retry included) sends the siblings known now: the broadcast refuses a
  // batch the list has not caught up with yet, and a list frozen at open
  // would keep failing after it has. A vault seen at open that a refetch
  // drops for a moment stays in the batch, the representative included, so
  // the modal never closes or switches to another deposit. The
  // representative's latest row is the one that groups it; its row from open
  // stands in while it is dropped.
  const broadcastingBatch = useMemo(() => {
    if (!openBroadcast) return null;
    const { representative, batchAtOpen } = openBroadcast;
    const listedIds = new Set(allActivities.map((a) => a.id));
    const unlisted = batchAtOpen.filter((a) => !listedIds.has(a.id));
    const latestRepresentative = allActivities.find(
      (a) => a.id === representative.id,
    );
    return getBatchSiblings(
      [...allActivities, ...unlisted],
      latestRepresentative ?? representative,
    );
  }, [allActivities, openBroadcast]);

  // Handle broadcast modal close
  const handleClose = useCallback(() => {
    setOpenBroadcast(null);
  }, []);

  // Handle broadcast success
  const handleSuccess = useCallback(() => {
    const totalBtc = (broadcastingBatch ?? []).reduce(
      (sum, a) => sum + parseFloat(a.collateral.amount || "0"),
      0,
    );
    setSuccessAmount(formatBtcValue(totalBtc));
    setOpenBroadcast(null);
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
    broadcastingActivity: openBroadcast?.representative ?? null,
    broadcastingBatchIds,
    isOpen: !!openBroadcast,
    successOpen,
    successAmount,
    handleBroadcastClick,
    handleClose,
    handleSuccess,
    handleSuccessClose,
  };
}
