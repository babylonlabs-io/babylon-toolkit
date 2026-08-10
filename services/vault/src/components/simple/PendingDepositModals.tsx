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
const EmergencyWithdrawModal = lazy(async () => {
  await ensureBtcEccInitialized();
  return import("@/components/deposit/EmergencyWithdrawModal").then(
    ({ EmergencyWithdrawModal }) => ({ default: EmergencyWithdrawModal }),
  );
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

      {/* Emergency Withdraw Modal (activate-and-redeem escape hatch) */}
      {emergencyWithdrawModal.withdrawing && (
        <Suspense fallback={null}>
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
