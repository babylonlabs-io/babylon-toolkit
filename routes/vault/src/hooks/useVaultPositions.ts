import type { Hex } from "viem";
import { usePeginRequests } from "./usePeginRequests";
import { usePeginStorage } from "./usePeginStorage";
import { useETHWallet } from "@/ui/common/context/wallet/ETHWalletProvider";
import { useBTCWallet } from "@/ui/common/context/wallet/BTCWalletProvider";
import type { VaultActivity } from "../mockData/vaultActivities";

/**
 * Hook to manage vault positions data fetching and wallet connection
 * Only responsible for data - UI modal states are managed by separate hooks
 */
export function useVaultPositions(onPegOut?: (activity: VaultActivity) => void) {
  // Use our wallet providers instead of separate state management
  const { address: ethAddress, connected: ethConnected } = useETHWallet();
  const { address: btcAddress, connected: btcConnected } = useBTCWallet();

  const connectedAddress = ethConnected ? (ethAddress as Hex | undefined) : undefined;

  const { activities: confirmedActivities, refetch } = usePeginRequests({
    connectedAddress,
    onPegOut,
  });

  const {
    allActivities,
    addPendingPegin,
  } = usePeginStorage({
    ethAddress: connectedAddress || '',
    confirmedPegins: confirmedActivities,
  });

  return {
    activities: allActivities,
    isWalletConnected: ethConnected && btcConnected,
    refetchActivities: refetch,
    connectedAddress,
    btcAddress,
    addPendingPegin,
  };
}
