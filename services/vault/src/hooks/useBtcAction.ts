import {
  useBTCWallet,
  useWalletConnect,
} from "@babylonlabs-io/wallet-connector";
import { useCallback } from "react";

import { useBtcWalletUnlock } from "@/hooks/useBtcWalletUnlock";

export function useBtcAction() {
  const { connected: btcConnected, loading, locked } = useBTCWallet();
  const { connected: sessionConfirmed, open } = useWalletConnect();
  const { unlock, isUnlocking } = useBtcWalletUnlock("Bitcoin action");
  // A locked extension cannot sign, so it counts as disconnected here.
  const connected = btcConnected && sessionConfirmed && !locked;

  const requireBtcWallet = useCallback(() => {
    if (connected) return true;
    if (btcConnected && locked) {
      // The caller retries once the provider clears `locked`.
      void unlock();
      return false;
    }
    open(btcConnected ? undefined : "BTC");
    return false;
  }, [connected, btcConnected, locked, unlock, open]);

  return {
    connected,
    btcConnected,
    sessionConfirmed,
    loading,
    locked,
    isUnlocking,
    requireBtcWallet,
  };
}
