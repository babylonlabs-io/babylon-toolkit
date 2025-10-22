import { useState, useCallback } from 'react';
import type { VaultActivity } from '../../types';

interface UseRedeemFlowStateResult {
  signModalOpen: boolean;
  successModalOpen: boolean;
  startRedeemFlow: (activity: VaultActivity) => void;
  handleSignSuccess: () => void;
  handleSignModalClose: () => void;
  handleSuccessClose: () => void;
}

/**
 * Hook to manage redeem flow modal state transitions
 *
 * State flow: closed → sign modal → success modal → closed
 */
export function useRedeemFlowState(): UseRedeemFlowStateResult {
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  const startRedeemFlow = useCallback((_activity: VaultActivity) => {
    setSignModalOpen(true);
  }, []);

  const handleSignSuccess = useCallback(() => {
    setSignModalOpen(false);
    setSuccessModalOpen(true);
  }, []);

  const handleSignModalClose = useCallback(() => {
    setSignModalOpen(false);
  }, []);

  const handleSuccessClose = useCallback(() => {
    setSuccessModalOpen(false);
  }, []);

  return {
    signModalOpen,
    successModalOpen,
    startRedeemFlow,
    handleSignSuccess,
    handleSignModalClose,
    handleSuccessClose,
  };
}
