import { useCallback } from "react";

import {
  useVaultRedeemState,
  VaultRedeemStep,
} from "../../context/deposit/VaultRedeemState";

/**
 * Hook to manage redeem modal state and actions
 *
 * Provides state and callbacks for the multi-step redeem flow:
 * Form → Review → Sign → Success
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

  // Handle clicking "Redeem" button from table row
  const handleRedeemClick = useCallback(
    (depositId: string) => {
      setRedeemData([depositId]);
      goToRedeemStep(VaultRedeemStep.FORM);
    },
    [setRedeemData, goToRedeemStep],
  );

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
    handleRedeemClick,
    handleFormNext,
    handleReviewConfirm,
    handleSignSuccess,
    handleClose,
  };
}
