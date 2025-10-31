/**
 * Hook for managing borrow and repay modal states
 * Handles borrow and repay transaction modal flows
 */

import { useState } from "react";

interface BorrowData {
  collateral: number;
  borrow: number;
}

interface RepayData {
  repay: number;
  withdraw: number;
}

export interface UseBorrowRepayModalsResult {
  // Borrow modal state
  showBorrowReviewModal: boolean;
  showBorrowSuccessModal: boolean;
  lastBorrowData: BorrowData;
  openBorrowReview: (collateralAmount: number, borrowAmount: number) => void;
  closeBorrowReview: () => void;
  showBorrowSuccess: () => void;
  closeBorrowSuccess: () => void;

  // Repay modal state
  showRepayReviewModal: boolean;
  showRepaySuccessModal: boolean;
  lastRepayData: RepayData;
  openRepayReview: (repayAmount: number, withdrawAmount: number) => void;
  closeRepayReview: () => void;
  showRepaySuccess: () => void;
  closeRepaySuccess: () => void;

  // Processing state
  processing: boolean;
  setProcessing: (processing: boolean) => void;
}

/**
 * Manages modal states for borrow and repay flows
 */
export function useBorrowRepayModals(): UseBorrowRepayModalsResult {
  // Borrow modal state
  const [showBorrowReviewModal, setShowBorrowReviewModal] = useState(false);
  const [showBorrowSuccessModal, setShowBorrowSuccessModal] = useState(false);
  const [lastBorrowData, setLastBorrowData] = useState<BorrowData>({
    collateral: 0,
    borrow: 0,
  });

  // Repay modal state
  const [showRepayReviewModal, setShowRepayReviewModal] = useState(false);
  const [showRepaySuccessModal, setShowRepaySuccessModal] = useState(false);
  const [lastRepayData, setLastRepayData] = useState<RepayData>({
    repay: 0,
    withdraw: 0,
  });

  // Processing state
  const [processing, setProcessing] = useState(false);

  return {
    // Borrow modal
    showBorrowReviewModal,
    showBorrowSuccessModal,
    lastBorrowData,
    openBorrowReview: (collateralAmount: number, borrowAmount: number) => {
      setLastBorrowData({ collateral: collateralAmount, borrow: borrowAmount });
      setShowBorrowReviewModal(true);
    },
    closeBorrowReview: () => setShowBorrowReviewModal(false),
    showBorrowSuccess: () => {
      setShowBorrowReviewModal(false);
      setShowBorrowSuccessModal(true);
    },
    closeBorrowSuccess: () => setShowBorrowSuccessModal(false),

    // Repay modal
    showRepayReviewModal,
    showRepaySuccessModal,
    lastRepayData,
    openRepayReview: (repayAmount: number, withdrawAmount: number) => {
      setLastRepayData({ repay: repayAmount, withdraw: withdrawAmount });
      setShowRepayReviewModal(true);
    },
    closeRepayReview: () => setShowRepayReviewModal(false),
    showRepaySuccess: () => {
      setShowRepayReviewModal(false);
      setShowRepaySuccessModal(true);
    },
    closeRepaySuccess: () => setShowRepaySuccessModal(false),

    // Processing
    processing,
    setProcessing,
  };
}
