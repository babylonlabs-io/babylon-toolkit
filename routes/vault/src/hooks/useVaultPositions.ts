import { useMemo } from "react";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import type { Hex } from "viem";
import { usePeginRequests } from "./usePeginRequests";

/**
 * Hook to manage vault positions data fetching and wallet connection
 * Only responsible for data - UI modal states are managed by separate hooks
 */
export function useVaultPositions() {
  const ethConnector = useChainConnector('ETH');

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
  // Note: We pass a no-op function since we don't need borrow callback here anymore
  const { activities, refetch } = usePeginRequests(
    connectedAddress,
    () => {} // no-op callback
  );

  return {
    activities,
    isWalletConnected: !!connectedAddress,
    refetchActivities: refetch,
  };
}
