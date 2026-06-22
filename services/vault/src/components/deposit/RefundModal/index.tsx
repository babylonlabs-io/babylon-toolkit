import { FullScreenDialog, Loader } from "@babylonlabs-io/core-ui";
import { useQuery } from "@tanstack/react-query";

import { useRefundState } from "@/hooks/deposit/useRefundState";
import { getRefundPreview } from "@/services/vault/vaultRefundService";
import type { VaultActivity } from "@/types/activity";

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
  const { refunding, refundTxId, error, handleRefund } = useRefundState({
    activity,
  });

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
      <FullScreenDialog
        open={open}
        onClose={handleDone}
        className="items-center justify-center p-6"
      >
        <RefundSuccessContent refundTxId={refundTxId} onDone={handleDone} />
      </FullScreenDialog>
    );
  }

  // Hold a neutral loading state until the preview resolves — the refund
  // form and the "nothing to refund" view are mutually exclusive and the
  // choice depends on the preview, so rendering either one early flashes
  // the wrong screen.
  if (previewQuery.isLoading) {
    return (
      <FullScreenDialog
        open={open}
        onClose={onClose}
        className="items-center justify-center p-6"
      >
        <Loader />
      </FullScreenDialog>
    );
  }

  // The Pre-PegIn never reached Bitcoin — there is no HTLC to spend, so a
  // refund would fail at broadcast. Surface "nothing to refund" instead of
  // letting the user sign a doomed transaction.
  if (previewQuery.data?.prePeginOnChain === false) {
    return (
      <FullScreenDialog
        open={open}
        onClose={onClose}
        className="items-center justify-center p-6"
      >
        <RefundNotBroadcastContent onClose={onClose} />
      </FullScreenDialog>
    );
  }

  // Block close while a broadcast is in flight to avoid dismissing the dialog
  // mid-signing.
  return (
    <FullScreenDialog
      open={open}
      onClose={refunding ? undefined : onClose}
      className="items-center justify-center p-6"
    >
      <RefundReviewContent
        amountSats={previewQuery.data?.amountSats ?? null}
        feeCapBasisSats={previewQuery.data?.feeCapBasisSats ?? null}
        defaultFeeRateSatsVb={previewQuery.data?.halfHourFeeSatsVb ?? null}
        previewError={previewError}
        refunding={refunding}
        error={error}
        onConfirm={handleRefund}
      />
    </FullScreenDialog>
  );
}
