import { useState, useCallback } from "react";
import type { VaultActivity } from "../../mockData/vaultActivities";

export function useBorrowFlowState() {
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  // Selected activity and borrow amount
  const [selectedActivity, setSelectedActivity] = useState<VaultActivity | null>(null);
  const [borrowAmount, setBorrowAmount] = useState(0);

  // Start the borrow flow with an activity
  const startBorrowFlow = useCallback((activity: VaultActivity) => {
    setSelectedActivity(activity);
    setModalOpen(true);
  }, []);

  // Handle modal close
  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setSelectedActivity(null);
  }, []);

  // Handle borrow click from BorrowModal
  const handleBorrowClick = useCallback((amount: number) => {
    setBorrowAmount(amount);
    setModalOpen(false);      // Close borrow modal
    setSignModalOpen(true);   // Open sign modal
  }, []);

  // Handle signing success
  const handleSignSuccess = useCallback(() => {
    setSignModalOpen(false);      // Close sign modal
    setSuccessModalOpen(true);    // Open success modal
  }, []);

  // Handle sign modal close
  const handleSignModalClose = useCallback(() => {
    setSignModalOpen(false);
  }, []);

  // Handle success modal close
  const handleSuccessClose = useCallback(() => {
    setSuccessModalOpen(false);
    setSelectedActivity(null);
    setBorrowAmount(0);
  }, []);

  return {
    modalOpen,
    signModalOpen,
    successModalOpen,
    selectedActivity,
    borrowAmount,
    startBorrowFlow,
    handleModalClose,
    handleBorrowClick,
    handleSignSuccess,
    handleSignModalClose,
    handleSuccessClose,
  };
}
