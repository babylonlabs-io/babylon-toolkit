import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useQuery } from "@tanstack/react-query";

import { useRefundState } from "@/hooks/deposit/useRefundState";
import { getRefundPreview } from "@/services/vault/vaultRefundService";
import type { VaultActivity } from "@/types/activity";

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
    staleTime: 60_000,
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
        defaultFeeRateSatsVb={previewQuery.data?.halfHourFeeSatsVb ?? null}
        previewLoading={previewQuery.isLoading}
        previewError={previewError}
        refunding={refunding}
        error={error}
        onConfirm={handleRefund}
      />
    </FullScreenDialog>
  );
}
