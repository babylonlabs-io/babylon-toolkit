import { useCallback } from "react";

import {
  useVaultRedeemState,
  VaultRedeemStep,
} from "../../context/deposit/VaultRedeemState";

/**
 * Hook to manage redeem modal internal state and actions
 *
 * Provides state and callbacks for the multi-step redeem flow:
 * Form → Review → Sign → Success
 *
 * Note: To trigger the redeem flow, use `triggerRedeem` from useVaultRedeemState
 * instead of this hook. This hook is for internal modal state management.
 */
export function useRedeemModal(options: { onSuccess: () => void }) {
  const { onSuccess } = options;

  const {
    step: redeemStep,
    redeemDepositIds,
    goToStep: goToRedeemStep,
    setRedeemData,
    reset: resetRedeem,
  } = useVaultRedeemState();

  // Handle form next (after selecting deposits to redeem)
  const handleFormNext = useCallback(
    (depositIds: string[]) => {
      setRedeemData(depositIds);
      goToRedeemStep(VaultRedeemStep.REVIEW);
    },
    [setRedeemData, goToRedeemStep],
  );

  // Handle review confirm (proceed to signing)
  const handleReviewConfirm = useCallback(() => {
    goToRedeemStep(VaultRedeemStep.SIGN);
  }, [goToRedeemStep]);

  // Handle sign success
  const handleSignSuccess = useCallback(() => {
    goToRedeemStep(VaultRedeemStep.SUCCESS);
    onSuccess();
  }, [goToRedeemStep, onSuccess]);

  // Handle modal close (reset state)
  const handleClose = useCallback(() => {
    resetRedeem();
  }, [resetRedeem]);

  return {
    redeemStep,
    redeemDepositIds,
    handleFormNext,
    handleReviewConfirm,
    handleSignSuccess,
    handleClose,
  };
}
