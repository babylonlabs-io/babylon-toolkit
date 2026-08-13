import {
  useBTCWallet,
  useWalletConnect,
} from "@babylonlabs-io/wallet-connector";
import { useCallback } from "react";

/**
 * Just-in-time gate for operations that need a Bitcoin signer.
 *
 * Returns `true` when the caller may continue immediately. Otherwise it opens
 * the wallet dialog directly on BTC and returns `false`; the original action is
 * deliberately not replayed after connection so every signature remains tied
 * to a fresh, explicit user gesture.
 */
export function useRequireBtcWallet() {
  const { connected: btcConnected } = useBTCWallet();
  const { open } = useWalletConnect();

  const requireBtcWallet = useCallback(() => {
    if (btcConnected) return true;
    open("BTC");
    return false;
  }, [btcConnected, open]);

  return { btcConnected, requireBtcWallet };
}
