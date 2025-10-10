import { useState, useCallback } from 'react';
import type { VaultActivity } from '../../mockData/vaultActivities';

/**
 * Hook to manage borrow flow modal state
 */
export function useBorrowFlow() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<VaultActivity | null>(null);

  const openBorrowFlow = useCallback((activity: VaultActivity) => {
    setSelectedActivity(activity);
    setIsOpen(true);
  }, []);

  const closeBorrowFlow = useCallback(() => {
    setIsOpen(false);
    setSelectedActivity(null);
  }, []);

  return {
    isOpen,
    selectedActivity,
    openBorrowFlow,
    closeBorrowFlow,
  };
}
