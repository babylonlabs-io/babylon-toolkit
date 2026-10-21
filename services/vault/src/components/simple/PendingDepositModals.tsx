/**
 * PendingDepositModals Component
 *
 * Renders the refund + reclaim + emergency-withdraw + expired redeem modals
 * used by the pending deposit section. The recovery escape hatches (HTLC
 * refund, depositor-claim reclaim, activate-and-redeem withdraw, expired-vault
 * redeem) each own a dedicated modal; every other per-vault action (Pre-PegIn
 * broadcast, WOTS, payout signing, activation, artifact download) is owned by
 * the deposit multistepper.
 */

import { ClaimExpiredVaultModal } from "@/components/deposit/ClaimExpiredVaultModal";
import { EmergencyWithdrawModal } from "@/components/deposit/EmergencyWithdrawModal";
import { ReclaimModal } from "@/components/deposit/ReclaimModal";
import { RefundModal } from "@/components/deposit/RefundModal";
import type { VaultActivity } from "@/types/activity";

interface RefundModalState {
  refundingActivity: VaultActivity | null;
  handleClose: () => void;
  handleSuccess: () => void;
}

interface ReclaimModalState {
  reclaimingActivity: VaultActivity | null;
  handleClose: () => void;
  handleBroadcast: (vaultId: string) => void;
  handleSuccess: () => void;
}

interface EmergencyWithdrawModalState {
  withdrawing: {
    activity: VaultActivity;
  } | null;
  handleClose: () => void;
  handleSuccess: () => void;
}

interface ClaimExpiredModalState {
  claimingActivity: VaultActivity | null;
  handleClose: () => void;
  handleSuccess: () => void;
}

interface PendingDepositModalsProps {
  refundModal: RefundModalState;
  reclaimModal: ReclaimModalState;
  emergencyWithdrawModal: EmergencyWithdrawModalState;
  claimExpiredModal: ClaimExpiredModalState;
}

export function PendingDepositModals({
  refundModal,
  reclaimModal,
  emergencyWithdrawModal,
  claimExpiredModal,
}: PendingDepositModalsProps) {
  return (
    <>
      {/* Refund Modal */}
      {refundModal.refundingActivity && (
        <RefundModal
          open={!!refundModal.refundingActivity}
          activity={refundModal.refundingActivity}
          onClose={refundModal.handleClose}
          onSuccess={refundModal.handleSuccess}
        />
      )}

      {/* Reclaim Modal (depositor-claim reserve sweep, post-settlement) */}
      {reclaimModal.reclaimingActivity && (
        <ReclaimModal
          open={!!reclaimModal.reclaimingActivity}
          activity={reclaimModal.reclaimingActivity}
          onClose={reclaimModal.handleClose}
          onSuccess={reclaimModal.handleSuccess}
          onBroadcast={reclaimModal.handleBroadcast}
        />
      )}

      {/* Emergency Withdraw Modal (activate-and-redeem escape hatch) */}
      {emergencyWithdrawModal.withdrawing && (
        <EmergencyWithdrawModal
          open={!!emergencyWithdrawModal.withdrawing}
          activity={emergencyWithdrawModal.withdrawing.activity}
          onClose={emergencyWithdrawModal.handleClose}
          onSuccess={emergencyWithdrawModal.handleSuccess}
        />
      )}

      {/* Expired-vault redeem Modal (claimExpiredVault) */}
      {claimExpiredModal.claimingActivity && (
        <ClaimExpiredVaultModal
          open={!!claimExpiredModal.claimingActivity}
          activity={claimExpiredModal.claimingActivity}
          onClose={claimExpiredModal.handleClose}
          onSuccess={claimExpiredModal.handleSuccess}
        />
      )}
    </>
  );
}
