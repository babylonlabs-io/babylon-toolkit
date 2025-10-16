import { useState, useCallback, useMemo } from 'react';
import { useChainConnector } from '@babylonlabs-io/wallet-connector';
import { useUTXOs, calculateBalance } from '../../hooks/useUTXOs';

/**
 * Hook to manage peg-in flow modal state
 */
export function usePeginFlow() {
  // Get BTC wallet address for fetching UTXOs
  const btcConnector = useChainConnector('BTC');
  const btcAddress = (btcConnector as any)?.connectedWallet?.account?.address as string | undefined;

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
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  const openPeginFlow = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closePeginFlow = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Handle peg-in click from PeginModal
  const handlePeginClick = useCallback((amount: number, providers: string[]) => {
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
