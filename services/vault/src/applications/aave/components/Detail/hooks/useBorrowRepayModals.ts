/**
 * Hook for managing borrow and repay modal states
 *
 * Centralizes modal state management for both transaction flows.
 */

import { useState } from "react";

interface BorrowSuccessData {
  amount: number;
}

interface RepaySuccessData {
  repayAmount: number;
  withdrawAmount: number;
}

export interface UseBorrowRepayModalsResult {
  // Borrow success modal
  showBorrowSuccess: boolean;
  borrowSuccessData: BorrowSuccessData;
  openBorrowSuccess: (amount: number) => void;
  closeBorrowSuccess: () => void;

  // Repay success modal
  showRepaySuccess: boolean;
  repaySuccessData: RepaySuccessData;
  openRepaySuccess: (repayAmount: number, withdrawAmount: number) => void;
  closeRepaySuccess: () => void;
}

export function useBorrowRepayModals(): UseBorrowRepayModalsResult {
  // Borrow success modal state
  const [showBorrowSuccess, setShowBorrowSuccess] = useState(false);
  const [borrowSuccessData, setBorrowSuccessData] = useState<BorrowSuccessData>(
    { amount: 0 },
  );

  // Repay success modal state
  const [showRepaySuccess, setShowRepaySuccess] = useState(false);
  const [repaySuccessData, setRepaySuccessData] = useState<RepaySuccessData>({
    repayAmount: 0,
    withdrawAmount: 0,
  });

  return {
    // Borrow
    showBorrowSuccess,
    borrowSuccessData,
    openBorrowSuccess: (amount: number) => {
      setBorrowSuccessData({ amount });
      setShowBorrowSuccess(true);
    },
    closeBorrowSuccess: () => setShowBorrowSuccess(false),

    // Repay
    showRepaySuccess,
    repaySuccessData,
    openRepaySuccess: (repayAmount: number, withdrawAmount: number) => {
      setRepaySuccessData({ repayAmount, withdrawAmount });
      setShowRepaySuccess(true);
    },
    closeRepaySuccess: () => setShowRepaySuccess(false),
  };
}
