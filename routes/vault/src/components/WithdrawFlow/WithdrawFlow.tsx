/**
 * WithdrawFlow - Orchestrates the withdraw collateral flow
 *
 * Flow:
 * 1. Sign modal - Confirm and execute withdrawal transaction
 * 2. Success modal - Show success message
 */

import { useWithdrawFlowState } from './useWithdrawFlowState';
import { WithdrawSignModal } from './WithdrawSignModal';
import { WithdrawSuccessModal } from './WithdrawSuccessModal';
import type { VaultActivity } from '../../types';

interface WithdrawFlowProps {
  activity: VaultActivity | null;
  isOpen: boolean;
  onClose: () => void;
  onWithdrawSuccess?: () => void;
}

export function WithdrawFlow({
  activity,
  isOpen,
  onClose,
  onWithdrawSuccess,
}: WithdrawFlowProps) {
  const { currentStep, goToSuccess, reset } = useWithdrawFlowState(isOpen);

  const handleSignSuccess = () => {
    goToSuccess();
  };

  const handleSuccessClose = async () => {
    reset();
    onClose();
    if (onWithdrawSuccess) {
      await onWithdrawSuccess();
    }
  };

  return (
    <>
      {/* Step 1: Sign Transaction */}
      <WithdrawSignModal
        open={isOpen && currentStep === 'sign'}
        onClose={onClose}
        onSuccess={handleSignSuccess}
        marketId={activity?.marketId}
        collateralAmount={activity?.collateral?.amount}
        collateralSymbol={activity?.collateral?.symbol}
      />

      {/* Step 2: Success */}
      <WithdrawSuccessModal
        open={isOpen && currentStep === 'success'}
        onClose={handleSuccessClose}
        collateralAmount={activity?.collateral?.amount}
        collateralSymbol={activity?.collateral?.symbol}
      />
    </>
  );
}
