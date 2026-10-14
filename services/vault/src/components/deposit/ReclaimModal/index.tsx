import { Loader } from "@babylonlabs-io/core-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { V3ModalShell } from "@/components/shared/V3ModalShell";
import { COPY } from "@/copy";
import { useReclaimState } from "@/hooks/deposit/useReclaimState";
import { useLedgerVaultDevice } from "@/hooks/useLedgerVaultDevice";
import { RECLAIM_STATUS_QUERY_KEY } from "@/hooks/useReclaimStatus";
import { logger } from "@/infrastructure";
import {
  ReclaimAlreadySettledError,
  getReclaimPreview,
} from "@/services/vault/vaultReclaimService";
import type { VaultActivity } from "@/types/activity";

import { ReclaimAlreadySettledContent } from "./ReclaimAlreadySettledContent";
import { ReclaimReviewContent } from "./ReclaimReviewContent";
import { ReclaimSuccessContent } from "./ReclaimSuccessContent";

interface ReclaimModalProps {
  open: boolean;
  activity: VaultActivity;
  onClose: () => void;
  onSuccess: () => void;
  /**
   * Called once, only when this session actually broadcast a sweep. Not called
   * on the already-settled path — that reserve was spent by someone else.
   */
  onBroadcast: (vaultId: string) => void;
}

const RECLAIM_PREVIEW_QUERY_KEY = "RECLAIM_PREVIEW";

export function ReclaimModal({
  open,
  activity,
  onClose,
  onSuccess,
  onBroadcast,
}: ReclaimModalProps) {
  const {
    reclaiming,
    reclaimTxId,
    alreadySettled,
    error,
    deviceDisconnected,
    handleReclaim,
  } = useReclaimState({ activity });
  const queryClient = useQueryClient();
  const ledgerDevice = useLedgerVaultDevice();
  const { cancelAppWait, reconnect } = ledgerDevice;
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectFailed, setReconnectFailed] = useState(false);

  // The reclaim signs with no intent loaded, so on a Ledger it can be held
  // until the Babylon Vault app is open. Closing the modal then ends the wait
  // rather than leaving it holding the device.
  const awaitingAppName =
    reclaiming && ledgerDevice.appWait.status === "awaiting-app"
      ? ledgerDevice.appWait.expectedAppName
      : null;
  const handleCloseDuringWait = useCallback(() => {
    cancelAppWait();
    onClose();
  }, [cancelAppWait, onClose]);

  // A lost device session recovers only through a new one, opened from this
  // click (the WebHID picker needs the gesture); the reclaim then runs again.
  const handleConfirm = useCallback(
    async (feeRate: number) => {
      if (deviceDisconnected) {
        setReconnecting(true);
        setReconnectFailed(false);
        try {
          await reconnect();
        } catch (reconnectError) {
          // The button stays available, so the depositor can fix the device
          // and try again; the notice says what to fix.
          logger.warn("Ledger reconnect before the reclaim failed", {
            reason:
              reconnectError instanceof Error
                ? reconnectError.message
                : String(reconnectError),
          });
          setReconnectFailed(true);
          return;
        } finally {
          setReconnecting(false);
        }
      }
      setReconnectFailed(false);
      await handleReclaim(feeRate);
    },
    [deviceDisconnected, reconnect, handleReclaim],
  );

  // The reserve poll carries a 55s staleTime, so without this the row would
  // sit on cached "unspent" data after the sweep. The in-session in-flight
  // marker already disables the button; this makes the next tick fetch fresh
  // so the row can settle back to its plain state as soon as the sweep mines.
  const handleDone = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [RECLAIM_STATUS_QUERY_KEY] });
    onSuccess();
    onClose();
  }, [queryClient, onSuccess, onClose]);

  const previewQuery = useQuery({
    queryKey: [RECLAIM_PREVIEW_QUERY_KEY, activity.id],
    queryFn: () => getReclaimPreview(activity.id),
    enabled: open && !reclaimTxId,
    retry: false,
    // No staleTime: refetch on every open. The reserve's spend status can flip
    // from another device between openings, and caching a stale "unspent"
    // would send the user into a doomed wallet prompt. The fetch is cheap.
  });

  const previewAmountSats = previewQuery.data?.reclaimableSats ?? null;

  // The reserve was already spent — either found by the preview probe or hit
  // at broadcast. Same resolved outcome either way.
  const settledDuringPreview =
    previewQuery.error instanceof ReclaimAlreadySettledError;

  const previewError =
    previewQuery.error && !settledDuringPreview
      ? previewQuery.error instanceof Error
        ? previewQuery.error.message
        : "Failed to load reclaim preview"
      : null;

  // Fire onSuccess only once the user acknowledges, so the parent refetch
  // doesn't race the success screen.
  if (reclaimTxId) {
    const handleBroadcastDone = () => {
      onBroadcast(activity.id);
      handleDone();
    };
    return (
      <V3ModalShell open={open} onClose={handleBroadcastDone}>
        <ReclaimSuccessContent
          reclaimTxId={reclaimTxId}
          amountSats={previewAmountSats}
          onDone={handleBroadcastDone}
        />
      </V3ModalShell>
    );
  }

  if (alreadySettled || settledDuringPreview) {
    return (
      <V3ModalShell open={open} onClose={handleDone}>
        <ReclaimAlreadySettledContent onClose={handleDone} />
      </V3ModalShell>
    );
  }

  // Hold a neutral loading state until the preview resolves — rendering the
  // review form before the amount and fee rate are known would flash a screen
  // full of em-dashes.
  if (previewQuery.isLoading) {
    return (
      // The shell stretches its content box to full width; the spinner is a
      // fixed-size inline element, so it needs centering of its own.
      <V3ModalShell
        open={open}
        onClose={onClose}
        contentClassName="flex justify-center"
      >
        <Loader />
      </V3ModalShell>
    );
  }

  // Close is blocked while a broadcast is in flight so the dialog cannot be
  // dismissed mid-signing — except while the device app wait holds it, which
  // nothing has signed yet.
  return (
    <V3ModalShell
      open={open}
      onClose={
        // A reconnect in flight continues into the reclaim on success, so the
        // modal stays open until it settles: closed, the reclaim would prompt
        // the device with nothing on screen.
        !reclaiming && !reconnecting
          ? onClose
          : awaitingAppName !== null
            ? handleCloseDuringWait
            : undefined
      }
    >
      <ReclaimReviewContent
        amountSats={previewAmountSats}
        defaultFeeRateSatsVb={previewQuery.data?.halfHourFeeSatsVb ?? null}
        previewError={previewError}
        reclaiming={reclaiming || reconnecting}
        error={reconnectFailed ? COPY.deposit.ledger.reconnectFailed : error}
        onConfirm={handleConfirm}
        awaitingAppName={awaitingAppName}
        reconnectRequired={deviceDisconnected}
      />
    </V3ModalShell>
  );
}
