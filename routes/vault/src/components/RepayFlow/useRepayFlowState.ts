import { useState, useCallback } from "react";
import type { VaultActivity } from "../../mockData/vaultActivities";

export function useRepayFlowState() {
  // Modal states
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  // Selected activity
  const [selectedActivity, setSelectedActivity] = useState<VaultActivity | null>(null);

  // Start the repay flow with an activity
  const startRepayFlow = useCallback((activity: VaultActivity) => {
    setSelectedActivity(activity);
    setSignModalOpen(true);  // Go straight to sign modal (no input needed for repay)
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
  }, []);

  return {
    signModalOpen,
    successModalOpen,
    selectedActivity,
    startRepayFlow,
    handleSignSuccess,
    handleSignModalClose,
    handleSuccessClose,
  };
}
