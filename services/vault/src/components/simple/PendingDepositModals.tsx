/**
 * PendingDepositModals Component
 *
 * Renders the broadcast + refund + success modals used by the pending deposit
 * section. The shared Pre-PegIn broadcast keeps a dedicated modal (it's hoisted
 * to a batch-level button); every other per-vault action (WOTS, payout signing,
 * activation, artifact download) is owned by the deposit multistepper opened
 * from the card body, not a per-action modal here.
 */

import { lazy, Suspense } from "react";

import { BroadcastSuccessModal } from "@/components/deposit/BroadcastSuccessModal";
import type { VaultActivity } from "@/types/activity";
import { ensureBtcEccInitialized } from "@/utils/btc/ensureBtcEccInitialized";

const SimpleDeposit = lazy(async () => {
  await ensureBtcEccInitialized();
  return import("./SimpleDeposit");
});
const RefundModal = lazy(async () => {
  await ensureBtcEccInitialized();
  return import("@/components/deposit/RefundModal").then(({ RefundModal }) => ({
    default: RefundModal,
  }));
});

interface BroadcastModalState {
  broadcastingActivity: VaultActivity | null;
  /** All vault IDs sharing the Pre-PegIn being broadcast (batched pegin). */
  broadcastingBatchIds: string[];
  handleClose: () => void;
  handleSuccess: () => void;
  successOpen: boolean;
  successAmount: string;
  handleSuccessClose: () => void;
}

interface RefundModalState {
  refundingActivity: VaultActivity | null;
  handleClose: () => void;
  handleSuccess: () => void;
}

interface PendingDepositModalsProps {
  broadcastModal: BroadcastModalState;
  refundModal: RefundModalState;
  ethAddress: string | undefined;
}

export function PendingDepositModals({
  broadcastModal,
  refundModal,
  ethAddress,
}: PendingDepositModalsProps) {
  return (
    <>
      {/* Broadcast Modal – full-screen with stepper */}
      {broadcastModal.broadcastingActivity && ethAddress && (
        <Suspense fallback={null}>
          <SimpleDeposit
            open
            resumeMode="broadcast_btc"
            onClose={broadcastModal.handleClose}
            onResumeSuccess={broadcastModal.handleSuccess}
            activity={broadcastModal.broadcastingActivity}
            batchVaultIds={broadcastModal.broadcastingBatchIds}
            depositorEthAddress={ethAddress}
          />
        </Suspense>
      )}

      {/* Refund Modal */}
      {refundModal.refundingActivity && (
        <Suspense fallback={null}>
          <RefundModal
            open
            activity={refundModal.refundingActivity}
            onClose={refundModal.handleClose}
            onSuccess={refundModal.handleSuccess}
          />
        </Suspense>
      )}

      {/* Broadcast Success Modal */}
      <BroadcastSuccessModal
        open={broadcastModal.successOpen}
        onClose={broadcastModal.handleSuccessClose}
        amount={broadcastModal.successAmount}
      />
    </>
  );
}
