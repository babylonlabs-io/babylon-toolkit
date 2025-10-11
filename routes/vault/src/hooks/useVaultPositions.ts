import { useState, useEffect } from "react";
import { useChainConnector, useWalletConnect, type IWallet, type IConnector, type IProvider } from "@babylonlabs-io/wallet-connector";
import type { Hex } from "viem";
import { usePeginRequests } from "./usePeginRequests";
import { usePeginStorage } from "./usePeginStorage";

/**
 * Type guard to check if a connector has the expected shape
 */
function isConnectorWithWallet<P extends IProvider>(
  connector: unknown
): connector is IConnector<string, P> & { connectedWallet: IWallet<P> | null } {
  return (
    connector !== null &&
    typeof connector === 'object' &&
    'connectedWallet' in connector &&
    'on' in connector &&
    typeof (connector as Record<string, unknown>).on === 'function'
  );
}

/**
 * Hook to manage vault positions data fetching and wallet connection
 * Only responsible for data - UI modal states are managed by separate hooks
 */
export function useVaultPositions() {
  const ethConnector = useChainConnector('ETH');
  const btcConnector = useChainConnector('BTC');
  const { connected } = useWalletConnect();

  const [ethWallet, setEthWallet] = useState<IWallet | null>(null);
  const [btcWallet, setBtcWallet] = useState<IWallet | null>(null);

  useEffect(() => {
    if (!isConnectorWithWallet(ethConnector)) return;

    setEthWallet(ethConnector.connectedWallet);

    const unsubscribeConnect = ethConnector.on('connect', (wallet: IWallet) => {
      setEthWallet(wallet);
    });

    const unsubscribeDisconnect = ethConnector.on('disconnect', () => {
      setEthWallet(null);
    });

    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
    };
  }, [ethConnector]);

  useEffect(() => {
    if (!isConnectorWithWallet(btcConnector)) return;

    setBtcWallet(btcConnector.connectedWallet);

    const unsubscribeConnect = btcConnector.on('connect', (wallet: IWallet) => {
      setBtcWallet(wallet);
    });

    const unsubscribeDisconnect = btcConnector.on('disconnect', () => {
      setBtcWallet(null);
    });

    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
    };
  }, [btcConnector]);

  const btcAddress = btcWallet?.account?.address;
  const connectedAddress = ethWallet?.account?.address as Hex | undefined;

  const { activities: confirmedActivities, refetch } = usePeginRequests(
    connectedAddress,
    () => { } // no-op callback
  );

  const {
    allActivities,
    addPendingPegin,
  } = usePeginStorage({
    ethAddress: connectedAddress || '',
    confirmedPegins: confirmedActivities,
  });

  return {
    activities: allActivities,
    isWalletConnected: connected && !!connectedAddress,
    refetchActivities: refetch,
    connectedAddress,
    btcAddress,
    addPendingPegin,
  };
}
