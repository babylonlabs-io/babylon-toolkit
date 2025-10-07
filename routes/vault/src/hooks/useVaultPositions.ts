import { useMemo } from "react";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import type { Hex } from "viem";
import { usePeginRequests } from "./usePeginRequests";
import { usePeginStorage } from "./usePeginStorage";

/**
 * Hook to manage vault positions data fetching and wallet connection
 * Only responsible for data - UI modal states are managed by separate hooks
 */
export function useVaultPositions() {
  const ethConnector = useChainConnector('ETH');
  const btcConnector = useChainConnector('BTC');

  // Get BTC address from connector
  const btcAddress = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (btcConnector as any)?.connectedWallet?.account?.address as string | undefined;
  }, [btcConnector]);

  const connectedAddress = useMemo(() => {
    const address = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ethConnector as any)?.connectedWallet?.account?.address ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ethConnector as any)?.connectedWallet?.accounts?.[0]?.address
    ) as Hex | undefined;
    return address;
  }, [ethConnector]);

  // Fetch pegin requests from blockchain
  const { activities: confirmedActivities, refetch } = usePeginRequests(
    connectedAddress,
    () => {} // no-op callback
  );

  // Integrate local storage for pending peg-ins
  const {
    allActivities,
    addPendingPegin,
  } = usePeginStorage({
    ethAddress: connectedAddress || '',
    confirmedPegins: confirmedActivities,
  });

  return {
    activities: allActivities,
    isWalletConnected: !!connectedAddress,
    refetchActivities: refetch,
    connectedAddress,
    btcAddress,
    addPendingPegin,
  };
}
