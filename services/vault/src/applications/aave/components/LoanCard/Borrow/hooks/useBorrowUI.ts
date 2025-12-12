/**
 * Borrow UI state management hook
 */

import { useMemo } from "react";

export interface UseBorrowUIProps {
  borrowAmount: number;
}

export interface UseBorrowUIResult {
  isDisabled: boolean;
  buttonText: string;
}

export function useBorrowUI({
  borrowAmount,
}: UseBorrowUIProps): UseBorrowUIResult {
  const isDisabled = borrowAmount === 0;

  const buttonText = useMemo(() => {
    if (borrowAmount === 0) {
      return "Enter an amount";
    }
    return "Borrow";
  }, [borrowAmount]);

  return {
    isDisabled,
    buttonText,
  };
}
