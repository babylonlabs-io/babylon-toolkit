import { useState, useCallback, useMemo } from 'react';
import { useUTXOs, calculateBalance } from '../../hooks/useUTXOs';
import type { VaultProvider } from '../../types';

/**
 * Hook to manage peg-in flow modal state
 * Only responsible for peg-in flow UI state - wallet connections are managed by parent components
 */
export function usePeginFlow(btcAddress: string | undefined) {
  // Fetch UTXOs and calculate balance from confirmed UTXOs
  const { confirmedUTXOs } = useUTXOs(btcAddress);
  const btcBalanceSat = useMemo(
    () => calculateBalance(confirmedUTXOs),
    [confirmedUTXOs],
  );

  // Modal states
  const [isOpen, setIsOpen] = useState(false);
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  // Peg-in flow data
  const [peginAmount, setPeginAmount] = useState(0);
  const [selectedProviders, setSelectedProviders] = useState<VaultProvider[]>([]);

  const openPeginFlow = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closePeginFlow = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Handle peg-in click from PeginModal
  const handlePeginClick = useCallback((amount: number, providers: VaultProvider[]) => {
    setPeginAmount(amount);
    setSelectedProviders(providers);
    setIsOpen(false);
    setSignModalOpen(true);
  }, []);

  // Handle signing success - accepts callback for parent to handle storage
  const handlePeginSignSuccess = useCallback((onSuccess?: () => void) => {
    setSignModalOpen(false);
    setSuccessModalOpen(true);

    // Call parent callback if provided
    if (onSuccess) {
      onSuccess();
    }
  }, []);

  // Close sign modal
  const closeSignModal = useCallback(() => {
    setSignModalOpen(false);
  }, []);

  // Handle success modal close
  const handlePeginSuccessClose = useCallback(() => {
    setSuccessModalOpen(false);
    setPeginAmount(0);
    setSelectedProviders([]);
  }, []);

  return {
    // Modal states
    isOpen,
    signModalOpen,
    successModalOpen,
    // Peg-in data
    peginAmount,
    selectedProviders,
    btcBalanceSat,
    // Actions
    openPeginFlow,
    closePeginFlow,
    closeSignModal,
    handlePeginClick,
    handlePeginSignSuccess,
    handlePeginSuccessClose,
  };
}
