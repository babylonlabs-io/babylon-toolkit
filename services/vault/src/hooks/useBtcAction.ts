import {
  useBTCWallet,
  useWalletConnect,
} from "@babylonlabs-io/wallet-connector";
import { useCallback } from "react";

export function useBtcAction() {
  const { connected: btcConnected, loading } = useBTCWallet();
  const { connected: sessionConfirmed, open } = useWalletConnect();
  const connected = btcConnected && sessionConfirmed;

  const requireBtcWallet = useCallback(() => {
    if (connected) return true;
    open(btcConnected ? undefined : "BTC");
    return false;
  }, [connected, btcConnected, open]);

  return {
    connected,
    btcConnected,
    sessionConfirmed,
    loading,
    requireBtcWallet,
  };
}
