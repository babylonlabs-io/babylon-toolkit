import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useEffect, useState } from "react";

import { processPublicKeyToXOnly } from "../utils/btc";

/**
 * Hook to fetch and manage BTC public key from wallet
 *
 * Returns the x-only public key (32 bytes, 64 hex chars) without 0x prefix,
 * suitable for use in vault provider RPC calls.
 *
 * @param btcConnected - Whether BTC wallet is connected
 * @returns BTC public key (x-only, 64 hex chars, no 0x prefix) or undefined
 */
export function useBtcPublicKey(btcConnected: boolean): string | undefined {
  const btcConnector = useChainConnector("BTC");
  const [btcPublicKey, setBtcPublicKey] = useState<string | undefined>();

  useEffect(() => {
    const fetchBtcPublicKey = async () => {
      if (btcConnected && btcConnector?.connectedWallet?.provider) {
        try {
          const publicKeyHex =
            await btcConnector.connectedWallet.provider.getPublicKeyHex();
          const xOnlyKey = processPublicKeyToXOnly(publicKeyHex);
          // Strip 0x prefix for RPC calls (32-byte x-only, 64 chars)
          const keyWithoutPrefix = xOnlyKey.startsWith("0x")
            ? xOnlyKey.slice(2)
            : xOnlyKey;
          setBtcPublicKey(keyWithoutPrefix);
        } catch (err) {
          console.error("Failed to get BTC public key:", err);
          setBtcPublicKey(undefined);
        }
      } else {
        setBtcPublicKey(undefined);
      }
    };
    fetchBtcPublicKey();
  }, [btcConnected, btcConnector]);

  return btcPublicKey;
}
