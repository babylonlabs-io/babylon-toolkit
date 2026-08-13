/**
 * PendingDepositModals Component
 *
 * Renders the broadcast + refund + emergency-withdraw + success modals used
 * by the pending deposit section. The shared Pre-PegIn broadcast keeps a
 * dedicated modal (it's hoisted to a batch-level button); the recovery escape
 * hatches (HTLC refund, activate-and-redeem withdraw) each own a dedicated
 * modal; every other per-vault action (WOTS, payout signing, activation,
 * artifact download) is owned by the deposit multistepper opened from the
 * card body.
 */

import { Loader } from "@babylonlabs-io/core-ui";
import { Suspense } from "react";

import { BroadcastSuccessModal } from "@/components/deposit/BroadcastSuccessModal";
import { V3ModalShell } from "@/components/shared/V3ModalShell";
import type { VaultActivity } from "@/types/activity";
import { ensureBtcEccInitialized } from "@/utils/btc/ensureBtcEccInitialized";
import { lazyWithRetry } from "@/utils/lazyWithRetry";

const SimpleDeposit = lazyWithRetry(async () => {
  await ensureBtcEccInitialized();
  return import("./SimpleDeposit");
});
const RefundModal = lazyWithRetry(async () => {
  await ensureBtcEccInitialized();
  return import("@/components/deposit/RefundModal").then(({ RefundModal }) => ({
    default: RefundModal,
  }));
});
const EmergencyWithdrawModal = lazyWithRetry(async () => {
  await ensureBtcEccInitialized();
  return import("@/components/deposit/EmergencyWithdrawModal").then(
    ({ EmergencyWithdrawModal }) => ({ default: EmergencyWithdrawModal }),
  );
});

/**
 * Suspense fallback for the lazy modals below. Each renders inside a
 * V3ModalShell once its chunk lands, so the pending state uses the same shell:
 * the dialog appears immediately, keeps a working close button while the chunk
 * plus the ECC library download, and its chrome doesn't shift when the real
 * content replaces it.
 */
function ModalLoadingShell({ onClose }: { onClose: () => void }) {
  return (
    <V3ModalShell open onClose={onClose}>
      <div className="flex w-full justify-center">
        <Loader />
      </div>
    </V3ModalShell>
  );
}

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

interface EmergencyWithdrawModalState {
  withdrawing: {
    activity: VaultActivity;
    stuckStateDetected: boolean;
  } | null;
  handleClose: () => void;
  handleSuccess: () => void;
}

interface PendingDepositModalsProps {
  broadcastModal: BroadcastModalState;
  refundModal: RefundModalState;
  emergencyWithdrawModal: EmergencyWithdrawModalState;
  ethAddress: string | undefined;
}

export function PendingDepositModals({
  broadcastModal,
  refundModal,
  emergencyWithdrawModal,
  ethAddress,
}: PendingDepositModalsProps) {
  return (
    <>
      {/* Broadcast Modal – full-screen with stepper */}
      {broadcastModal.broadcastingActivity && ethAddress && (
        <Suspense
          fallback={<ModalLoadingShell onClose={broadcastModal.handleClose} />}
        >
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
        <Suspense
          fallback={<ModalLoadingShell onClose={refundModal.handleClose} />}
        >
          <RefundModal
            open
            activity={refundModal.refundingActivity}
            onClose={refundModal.handleClose}
            onSuccess={refundModal.handleSuccess}
          />
        </Suspense>
      )}

      {/* Emergency Withdraw Modal (activate-and-redeem escape hatch) */}
      {emergencyWithdrawModal.withdrawing && (
        <Suspense
          fallback={
            <ModalLoadingShell onClose={emergencyWithdrawModal.handleClose} />
          }
        >
          <EmergencyWithdrawModal
            open
            activity={emergencyWithdrawModal.withdrawing.activity}
            stuckStateDetected={
              emergencyWithdrawModal.withdrawing.stuckStateDetected
            }
            onClose={emergencyWithdrawModal.handleClose}
            onSuccess={emergencyWithdrawModal.handleSuccess}
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
