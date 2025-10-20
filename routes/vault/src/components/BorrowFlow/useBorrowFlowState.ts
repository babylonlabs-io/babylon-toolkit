import { useState, useCallback } from "react";
import type { Hex } from "viem";

export function useBorrowFlowState() {
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  // Borrow flow state - no longer needs activity
  const [borrowAmount, setBorrowAmount] = useState(0);
  const [marketId, setMarketId] = useState<string>("");
  const [selectedCollateralTxHashes, setSelectedCollateralTxHashes] = useState<Hex[]>([]);

  // Start the borrow flow
  const startBorrowFlow = useCallback(() => {
    setModalOpen(true);
  }, []);

  // Handle modal close
  const handleModalClose = useCallback(() => {
    setModalOpen(false);
  }, []);

  // Handle borrow click from BorrowModal
  const handleBorrowClick = useCallback((amount: number, selectedMarketId: string, collateralTxHashes: Hex[]) => {
    setBorrowAmount(amount);
    setMarketId(selectedMarketId);
    setSelectedCollateralTxHashes(collateralTxHashes);
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
    setBorrowAmount(0);
    setMarketId("");
    setSelectedCollateralTxHashes([]);
  }, []);

  return {
    modalOpen,
    signModalOpen,
    successModalOpen,
    borrowAmount,
    marketId,
    selectedCollateralTxHashes,
    startBorrowFlow,
    handleModalClose,
    handleBorrowClick,
    handleSignSuccess,
    handleSignModalClose,
    handleSuccessClose,
  };
}
