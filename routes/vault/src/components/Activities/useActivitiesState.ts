import { useState, useMemo, useCallback } from "react";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import type { Hex } from "viem";
import type { VaultActivity } from "../../mockData/vaultActivities";
import { usePeginRequests } from "../../hooks/usePeginRequests";

export function useActivitiesState() {
  const ethConnector = useChainConnector('ETH');

  const connectedAddress = useMemo(() => {
    const address = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ethConnector as any)?.connectedWallet?.account?.address ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ethConnector as any)?.connectedWallet?.accounts?.[0]?.address
    ) as Hex | undefined;
    console.log('[useActivitiesState] connectedAddress:', address);
    return address;
  }, [ethConnector]);

  // Borrow flow state
  const [borrowFlowOpen, setBorrowFlowOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<VaultActivity | null>(null);

  const handleActivityBorrow = useCallback((activity: VaultActivity) => {
    setSelectedActivity(activity);
    setBorrowFlowOpen(true);
  }, []);

  // Fetch pegin requests from blockchain
  const { activities } = usePeginRequests(
    connectedAddress,
    handleActivityBorrow
  );

  console.log('[useActivitiesState] activities from usePeginRequests:', activities);

  const handleNewBorrow = useCallback(() => {
    if (activities.length > 0) {
      setSelectedActivity(activities[0]);
      setBorrowFlowOpen(true);
    }
  }, [activities]);

  const handleBorrowFlowClose = useCallback(() => {
    setBorrowFlowOpen(false);
    setSelectedActivity(null);
  }, []);

  return {
    activities,
    borrowFlowOpen,
    selectedActivity,
    handleNewBorrow,
    handleActivityBorrow,
    handleBorrowFlowClose,
    isWalletConnected: !!connectedAddress,
  };
}
