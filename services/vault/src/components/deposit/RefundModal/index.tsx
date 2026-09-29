import { Loader } from "@babylonlabs-io/core-ui";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { V3ModalShell } from "@/components/shared/V3ModalShell";
import { COPY } from "@/copy";
import { useRefundState } from "@/hooks/deposit/useRefundState";
import { useLedgerVaultDevice } from "@/hooks/useLedgerVaultDevice";
import { logger } from "@/infrastructure";
import { getRefundPreview } from "@/services/vault/vaultRefundService";
import type { VaultActivity } from "@/types/activity";
import type { LedgerDeviceStep } from "@/types/ledgerDeviceStep";

import { RefundNotBroadcastContent } from "./RefundNotBroadcastContent";
import { RefundReviewContent } from "./RefundReviewContent";
import { RefundSuccessContent } from "./RefundSuccessContent";

interface RefundModalProps {
  open: boolean;
  activity: VaultActivity;
  onClose: () => void;
  onSuccess: () => void;
}

const REFUND_PREVIEW_QUERY_KEY = "REFUND_PREVIEW";

export function RefundModal({
  open,
  activity,
  onClose,
  onSuccess,
}: RefundModalProps) {
  const { refunding, refundTxId, error, deviceDisconnected, handleRefund } =
    useRefundState({
      activity,
    });
  const ledgerDevice = useLedgerVaultDevice();
  const { cancelAppWait, reconnect } = ledgerDevice;
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectFailed, setReconnectFailed] = useState(false);

  // The refund signs with no intent loaded, so on a Ledger it can be held
  // until the Babylon Vault app is open. Closing the modal then ends the wait
  // rather than leaving it holding the device.
  const awaitingAppName =
    refunding && ledgerDevice.appWait.status === "awaiting-app"
      ? ledgerDevice.appWait.expectedAppName
      : null;
  const ledgerStep = useMemo<Exclude<
    LedgerDeviceStep,
    { kind: "awaiting-continue" }
  > | null>(
    () =>
      awaitingAppName !== null
        ? { kind: "awaiting-app", appName: awaitingAppName }
        : deviceDisconnected
          ? { kind: "reconnect-required" }
          : null,
    [awaitingAppName, deviceDisconnected],
  );
  const handleCloseDuringWait = useCallback(() => {
    cancelAppWait();
    onClose();
  }, [cancelAppWait, onClose]);

  // A lost device session recovers only through a new one, opened from this
  // click (the WebHID picker needs the gesture); the refund then runs again.
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
          logger.warn("Ledger reconnect before the refund failed", {
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
      await handleRefund(feeRate);
    },
    [deviceDisconnected, reconnect, handleRefund],
  );

  const previewQuery = useQuery({
    queryKey: [REFUND_PREVIEW_QUERY_KEY, activity.id],
    queryFn: () => getRefundPreview(activity.id),
    enabled: open && !refundTxId,
    // No staleTime: refetch on every open. The `prePeginOnChain` signal can
    // flip in either direction (rebroadcast from another tab, mempool
    // eviction) and caching a negative result risks showing "Nothing to
    // refund" after a fresh broadcast — or the inverse — within the cache
    // window. The fetch is cheap (one contract read + one mempool probe).
  });

  const previewError = previewQuery.error
    ? previewQuery.error instanceof Error
      ? previewQuery.error.message
      : "Failed to load refund preview"
    : null;

  // Fire onSuccess only after the user acknowledges the result so the parent
  // refetch doesn't race the success modal.
  if (refundTxId) {
    const handleDone = () => {
      onSuccess();
      onClose();
    };
    return (
      <V3ModalShell open={open} onClose={handleDone}>
        <RefundSuccessContent refundTxId={refundTxId} onDone={handleDone} />
      </V3ModalShell>
    );
  }

  // Hold a neutral loading state until the preview resolves — the refund
  // form and the "nothing to refund" view are mutually exclusive and the
  // choice depends on the preview, so rendering either one early flashes
  // the wrong screen.
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

  // The Pre-PegIn never reached Bitcoin — there is no HTLC to spend, so a
  // refund would fail at broadcast. Surface "nothing to refund" instead of
  // letting the user sign a doomed transaction.
  if (previewQuery.data?.prePeginOnChain === false) {
    return (
      <V3ModalShell open={open} onClose={onClose}>
        <RefundNotBroadcastContent onClose={onClose} />
      </V3ModalShell>
    );
  }

  // Block close while a broadcast is in flight to avoid dismissing the dialog
  // mid-signing.
  return (
    <V3ModalShell
      open={open}
      onClose={
        // A reconnect in flight continues into the refund on success, so the
        // modal stays open until it settles: closed, the refund would prompt
        // the device with nothing on screen.
        !refunding && !reconnecting
          ? onClose
          : awaitingAppName !== null
            ? handleCloseDuringWait
            : undefined
      }
    >
      <RefundReviewContent
        amountSats={previewQuery.data?.amountSats ?? null}
        feeCapBasisSats={previewQuery.data?.feeCapBasisSats ?? null}
        defaultFeeRateSatsVb={previewQuery.data?.halfHourFeeSatsVb ?? null}
        previewError={previewError}
        refunding={refunding || reconnecting}
        error={reconnectFailed ? COPY.deposit.ledger.reconnectFailed : error}
        onConfirm={handleConfirm}
        ledgerStep={ledgerStep}
      />
    </V3ModalShell>
  );
}
