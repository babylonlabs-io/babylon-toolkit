import { useState, useCallback, useMemo } from "react";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import type { Hex } from "viem";

export function usePeginFlowState() {
  const ethConnector = useChainConnector('ETH');
  const btcConnector = useChainConnector('BTC');

  // Get BTC address from connector
  const btcAddress = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (btcConnector as any)?.connectedWallet?.account?.address as string | undefined;
  }, [btcConnector]);

  // Get ETH address from connector
  const connectedAddress = useMemo(() => {
    const address = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ethConnector as any)?.connectedWallet?.account?.address ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ethConnector as any)?.connectedWallet?.accounts?.[0]?.address
    ) as Hex | undefined;
    return address;
  }, [ethConnector]);

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

  // Handle signing success
  const handlePeginSignSuccess = useCallback(() => {
    setPeginSignModalOpen(false);
    setPeginSuccessModalOpen(true);
  }, []);

  // Handle success modal close
  const handlePeginSuccessClose = useCallback(() => {
    setPeginSuccessModalOpen(false);
    setPeginAmount(0);
    setSelectedProviders([]);
  }, []);

  return {
    // Wallet data
    connectedAddress,
    btcAddress,
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
