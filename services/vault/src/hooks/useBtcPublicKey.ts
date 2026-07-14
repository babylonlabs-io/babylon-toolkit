import { processPublicKeyToXOnly } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useState } from "react";

import { logger } from "@/infrastructure";

export interface UseBtcPublicKeyResult {
  /**
   * X-only public key (32 bytes, 64 hex chars, no 0x prefix), suitable for
   * vault provider RPC calls. `undefined` while disconnected, still fetching,
   * or after a failed wallet read.
   */
  publicKey: string | undefined;
  /**
   * Terminal wallet read failure (`getPublicKeyHex` threw — e.g. a locked or
   * unresponsive extension). Surfaced so callers can prompt a reconnect
   * instead of waiting forever on an undefined key.
   */
  error: Error | null;
  /**
   * Force a re-read of the public key. Call after the user reconnects/unlocks
   * the wallet: the reconnect CTA drives `BTCWalletProvider.reconnect()`, which
   * re-auths the raw provider WITHOUT emitting a connector event or changing
   * this hook's deps, so recovery from a stuck `error` needs an explicit nudge.
   */
  refetch: () => void;
}

/**
 * Hook to fetch and manage the BTC public key from the connected wallet.
 *
 * @param btcConnected - Whether BTC wallet is connected
 */
export function useBtcPublicKey(btcConnected: boolean): UseBtcPublicKeyResult {
  const btcConnector = useChainConnector("BTC");
  const [result, setResult] = useState<{
    publicKey: string | undefined;
    error: Error | null;
  }>({ publicKey: undefined, error: null });
  const [refetchNonce, setRefetchNonce] = useState(0);
  const refetch = useCallback(() => setRefetchNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
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
          if (!cancelled) {
            setResult({ publicKey: keyWithoutPrefix, error: null });
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          logger.error(error, {
            data: { context: "Failed to get BTC public key" },
          });
          if (!cancelled) setResult({ publicKey: undefined, error });
        }
      } else if (!cancelled) {
        setResult({ publicKey: undefined, error: null });
      }
    };
    fetchBtcPublicKey();
    return () => {
      cancelled = true;
    };
  }, [btcConnected, btcConnector, refetchNonce]);

  return { ...result, refetch };
}
