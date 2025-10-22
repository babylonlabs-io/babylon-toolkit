/**
 * Hook to manage the borrow more flow state
 *
 * Coordinates the multi-step flow:
 * 1. User clicks "Borrow More" button
 * 2. Show BorrowMoreModal (input amount + sign transaction)
 * 3. Show success modal
 */

import { useState, useCallback } from 'react';
import type { VaultActivity } from '../../types';

interface UseBorrowMoreFlowStateResult {
  /** Whether borrow more modal is open */
  borrowMoreModalOpen: boolean;
  /** Whether success modal is open */
  successModalOpen: boolean;
  /** Start the borrow more flow */
  startBorrowMoreFlow: (activity: VaultActivity) => void;
  /** Handle borrow more modal success */
  handleBorrowMoreSuccess: () => void;
  /** Handle borrow more modal close */
  handleBorrowMoreModalClose: () => void;
  /** Handle success modal close */
  handleSuccessClose: () => void;
}

export function useBorrowMoreFlowState(): UseBorrowMoreFlowStateResult {
  const [borrowMoreModalOpen, setBorrowMoreModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  const startBorrowMoreFlow = useCallback((_activity: VaultActivity) => {
    // Open the borrow more modal directly
    setBorrowMoreModalOpen(true);
  }, []);

  const handleBorrowMoreSuccess = useCallback(() => {
    // Close borrow more modal and show success
    setBorrowMoreModalOpen(false);
    setSuccessModalOpen(true);
  }, []);

  const handleBorrowMoreModalClose = useCallback(() => {
    setBorrowMoreModalOpen(false);
  }, []);

  const handleSuccessClose = useCallback(() => {
    setSuccessModalOpen(false);
  }, []);

  return {
    borrowMoreModalOpen,
    successModalOpen,
    startBorrowMoreFlow,
    handleBorrowMoreSuccess,
    handleBorrowMoreModalClose,
    handleSuccessClose,
  };
}
