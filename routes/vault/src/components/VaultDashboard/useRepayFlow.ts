import { useState, useCallback } from 'react';
import type { VaultActivity } from '../../mockData/vaultActivities';

/**
 * Hook to manage repay flow modal state
 */
export function useRepayFlow() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<VaultActivity | null>(null);

  const openRepayFlow = useCallback((activity: VaultActivity) => {
    setSelectedActivity(activity);
    setIsOpen(true);
  }, []);

  const closeRepayFlow = useCallback(() => {
    setIsOpen(false);
    setSelectedActivity(null);
  }, []);

  return {
    isOpen,
    selectedActivity,
    openRepayFlow,
    closeRepayFlow,
  };
}
