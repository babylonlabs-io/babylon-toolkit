/**
 * PendingDepositModals Component
 *
 * Renders the broadcast + refund + success modals used by the pending deposit
 * section. The shared Pre-PegIn broadcast keeps a dedicated modal (it's hoisted
 * to a batch-level button); every other per-vault action (WOTS, payout signing,
 * activation, artifact download) is owned by the deposit multistepper opened
 * from the card body, not a per-action modal here.
 */

import { BroadcastSuccessModal } from "@/components/deposit/BroadcastSuccessModal";
import { RefundModal } from "@/components/deposit/RefundModal";
import type { VaultActivity } from "@/types/activity";

import SimpleDeposit from "./SimpleDeposit";

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
        <SimpleDeposit
          open={!!broadcastModal.broadcastingActivity}
          resumeMode="broadcast_btc"
          onClose={broadcastModal.handleClose}
          onResumeSuccess={broadcastModal.handleSuccess}
          activity={broadcastModal.broadcastingActivity}
          batchVaultIds={broadcastModal.broadcastingBatchIds}
          depositorEthAddress={ethAddress}
        />
      )}

      {/* Refund Modal */}
      {refundModal.refundingActivity && (
        <RefundModal
          open={!!refundModal.refundingActivity}
          activity={refundModal.refundingActivity}
          onClose={refundModal.handleClose}
          onSuccess={refundModal.handleSuccess}
        />
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
