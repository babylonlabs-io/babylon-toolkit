import { useState, useCallback } from "react";

export function usePeginFlowState() {
  // Hardcoded BTC balance (in satoshis) - TODO: Replace with real wallet balance
  const btcBalanceSat = 500000000; // 5 BTC

  // Modal states
  const [peginModalOpen, setPeginModalOpen] = useState(false);
  const [peginSignModalOpen, setPeginSignModalOpen] = useState(false);
  const [peginSuccessModalOpen, setPeginSuccessModalOpen] = useState(false);

  // Peg-in flow data
  const [peginAmount, setPeginAmount] = useState(0);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  // Start the peg-in flow
  const handleNewBorrow = useCallback(() => {
    setPeginModalOpen(true);
  }, []);

  // Handle peg-in click from PeginModal
  const handlePeginClick = useCallback((amount: number, providers: string[]) => {
    console.log("Peg-in clicked:", { amount, providers });
    setPeginAmount(amount);
    setSelectedProviders(providers);
    setPeginModalOpen(false);
    setPeginSignModalOpen(true);
  }, []);

  // Handle signing success - accepts callback for parent to handle storage
  const handlePeginSignSuccess = useCallback((onSuccess?: () => void) => {
    setPeginSignModalOpen(false);
    setPeginSuccessModalOpen(true);
    
    // Call parent callback if provided
    if (onSuccess) {
      onSuccess();
    }
  }, []);

  // Handle success modal close
  const handlePeginSuccessClose = useCallback(() => {
    setPeginSuccessModalOpen(false);
    setPeginAmount(0);
    setSelectedProviders([]);
  }, []);

  return {
    // Wallet data
    btcBalanceSat,
    // Modal states
    peginModalOpen,
    peginSignModalOpen,
    peginSuccessModalOpen,
    // Peg-in data
    peginAmount,
    selectedProviders,
    // Actions
    handleNewBorrow,
    handlePeginClick,
    handlePeginSignSuccess,
    handlePeginSuccessClose,
    setPeginModalOpen,
    setPeginSignModalOpen,
  };
}