import {
  useBTCWallet,
  useWalletConnect,
} from "@babylonlabs-io/wallet-connector";
import { useCallback } from "react";

export function useBtcAction() {
  const { connected: btcConnected } = useBTCWallet();
  const { connected: sessionConfirmed, open } = useWalletConnect();
  const connected = btcConnected && sessionConfirmed;

  const requireBtcWallet = useCallback(() => {
    if (connected) return true;
    open("BTC");
    return false;
  }, [connected, open]);

  return { connected, requireBtcWallet };
}
