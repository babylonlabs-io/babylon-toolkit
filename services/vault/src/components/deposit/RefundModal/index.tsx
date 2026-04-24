/**
 * RefundModal
 *
 * Controller for the BTC refund flow. Renders one of two phases depending on
 * state:
 *   - Review (FullScreenDialog + RefundReviewContent) — user sees the refund
 *     amount, edits the network fee rate, and clicks Confirm.
 *   - Success (ResponsiveDialog + RefundSuccessContent) — shown once the
 *     refund tx is broadcast; user can View on Blockchain explorer or Done.
 *
 * The refund is a single BTC action — there is no deposit stepper. Auto-start
 * was removed: the user explicitly clicks Confirm on the review.
 */

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

  // Success phase — fire onSuccess() once the user dismisses the modal so
  // the parent refetches activities only after the result is acknowledged.
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

  // Review phase — block close while a broadcast is in flight to avoid the
  // user dismissing the dialog mid-signing.
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
