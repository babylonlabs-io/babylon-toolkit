import { processPublicKeyToXOnly } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useRef, useState } from "react";

import { logger } from "@/infrastructure";

interface BtcPublicKeyState {
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
}

export interface UseBtcPublicKeyResult extends BtcPublicKeyState {
  /**
   * Re-read the public key, resolving once the read settles. Call after the
   * user reconnects/unlocks the wallet: the reconnect CTA drives
   * `BTCWalletProvider.reconnect()`, which re-auths the raw provider WITHOUT
   * emitting a connector event or changing this hook's deps, so recovery from
   * a stuck `error` needs an explicit nudge. Awaiting it lets the caller hold
   * its "reconnecting" state until `error` is fresh, avoiding a window where
   * the CTA looks actionable while still showing the stale failure.
   */
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage the BTC public key from the connected wallet.
 *
 * @param btcConnected - Whether BTC wallet is connected
 */
export function useBtcPublicKey(btcConnected: boolean): UseBtcPublicKeyResult {
  const btcConnector = useChainConnector("BTC");
  const [result, setResult] = useState<BtcPublicKeyState>({
    publicKey: undefined,
    error: null,
  });
  // Generation guard: only the most recent read commits. Without it a slow
  // in-flight mount read (started while the wallet was locked) could settle
  // AFTER a successful reconnect refetch and clobber the fresh key with a
  // stale error — reintroducing the stuck-CTA state this hook exists to avoid.
  const genRef = useRef(0);

  // Pure read — resolves the current key state without committing, so the
  // mount effect and the imperative refetch share one code path.
  const readPublicKey = useCallback(async (): Promise<BtcPublicKeyState> => {
    if (!btcConnected || !btcConnector?.connectedWallet?.provider) {
      return { publicKey: undefined, error: null };
    }
    try {
      const publicKeyHex =
        await btcConnector.connectedWallet.provider.getPublicKeyHex();
      const xOnlyKey = processPublicKeyToXOnly(publicKeyHex);
      // Strip 0x prefix for RPC calls (32-byte x-only, 64 chars)
      const keyWithoutPrefix = xOnlyKey.startsWith("0x")
        ? xOnlyKey.slice(2)
        : xOnlyKey;
      return { publicKey: keyWithoutPrefix, error: null };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(error, {
        data: { context: "Failed to get BTC public key" },
      });
      return { publicKey: undefined, error };
    }
  }, [btcConnected, btcConnector]);

  const refetch = useCallback(async () => {
    const gen = ++genRef.current;
    const next = await readPublicKey();
    // Drop a read superseded by a newer one (mount read vs. refetch).
    if (gen === genRef.current) setResult(next);
  }, [readPublicKey]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { ...result, refetch };
}
