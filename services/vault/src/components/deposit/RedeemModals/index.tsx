/**
 * RedeemModals Component
 *
 * Self-contained component that renders all redeem flow modals.
 * Manages its own state via useRedeemModal hook.
 * Used by both DepositOverview and AaveOverview.
 */

import { useMemo } from "react";

import { VaultRedeemStep } from "../../../context/deposit/VaultRedeemState";
import { useRedeemModal } from "../../../hooks/deposit/useRedeemModal";
import type { VaultActivity } from "../../../types/activity";
import type { Deposit } from "../../../types/vault";
import { RedeemCollateralModal } from "../RedeemFormModal";
import { RedeemCollateralReviewModal } from "../RedeemReviewModal";
import { RedeemCollateralSignModal } from "../RedeemSignModal";
import { RedeemCollateralSuccessModal } from "../RedeemSuccessModal";

export interface RedeemModalsProps {
  /** Deposits available for redemption (for form/review modals) */
  deposits: Deposit[];
  /** Vault activities (for sign modal - needs applicationController) */
  activities: VaultActivity[];
  /** Optional callback after successful redemption */
  onSuccess?: () => void;
}

/**
 * Renders all redeem flow modals based on current step.
 * Manages its own state via useRedeemModal hook.
 * Only the modal matching the current step will be visible.
 */
export function RedeemModals({
  deposits,
  activities,
  onSuccess,
}: RedeemModalsProps) {
  // Use the redeem modal hook internally - parent doesn't need to know about these handlers
  const {
    redeemStep,
    redeemDepositIds,
    handleFormNext,
    handleReviewConfirm,
    handleSignSuccess,
    handleClose,
  } = useRedeemModal({
    onSuccess: onSuccess ?? (() => {}),
  });

  // Calculate total redeem amount for success modal
  const redeemTotalAmount = useMemo(() => {
    return deposits
      .filter((d) => redeemDepositIds.includes(d.id))
      .reduce((sum, d) => sum + d.amount, 0);
  }, [deposits, redeemDepositIds]);

  return (
    <>
      {/* Redeem Form Modal */}
      <RedeemCollateralModal
        open={redeemStep === VaultRedeemStep.FORM}
        onClose={handleClose}
        onNext={handleFormNext}
        deposits={deposits}
      />

      {/* Redeem Review Modal */}
      <RedeemCollateralReviewModal
        open={redeemStep === VaultRedeemStep.REVIEW}
        onClose={handleClose}
        onConfirm={handleReviewConfirm}
        depositIds={redeemDepositIds}
        deposits={deposits}
      />

      {/* Redeem Sign Modal */}
      <RedeemCollateralSignModal
        open={redeemStep === VaultRedeemStep.SIGN}
        onClose={handleClose}
        onSuccess={handleSignSuccess}
        activities={activities}
        depositIds={redeemDepositIds}
      />

      {/* Redeem Success Modal */}
      <RedeemCollateralSuccessModal
        open={redeemStep === VaultRedeemStep.SUCCESS}
        onClose={handleClose}
        totalAmount={redeemTotalAmount}
        depositCount={redeemDepositIds.length}
      />
    </>
  );
}
