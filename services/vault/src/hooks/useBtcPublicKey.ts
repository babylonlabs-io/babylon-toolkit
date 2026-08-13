import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useRef, useState } from "react";

import { logger } from "@/infrastructure";

const X_ONLY_PUBKEY_HEX_LENGTH = 64;
const COMPRESSED_PUBKEY_HEX_LENGTH = 66;
const UNCOMPRESSED_PUBKEY_HEX_LENGTH = 130;
/** SEC1 keys prefix the x coordinate with a `02`/`03`/`04` byte. */
const SEC1_PREFIX_HEX_LENGTH = 2;

/**
 * Local copy of the SDK's `canonicalizeBtcPubkey`
 * (packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts): lowercase
 * x-only hex, no `0x`, on every path.
 *
 * Inlined rather than imported because this hook is reachable from ETH-only
 * route chunks and the SDK export lives behind `@babylonlabs-io/ts-sdk/tbv/core`,
 * a barrel that pulls bitcoinjs-lib into every chunk importing it — which
 * `context/deposit/__tests__/pollingImportBoundary.test.ts` bans. By contrast
 * `services/vault/src/services/vault/verifyResumeParticipantKeys.ts`
 * deliberately keeps the SDK import: it already sits in a BTC chunk.
 */
function canonicalizeBtcPubkey(publicKeyHex: string): string {
  const cleanHex = publicKeyHex.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]*$/.test(cleanHex) || cleanHex.length % 2 !== 0) {
    throw new Error(`Invalid hex characters in public key: ${publicKeyHex}`);
  }
  if (cleanHex.length === X_ONLY_PUBKEY_HEX_LENGTH) {
    return cleanHex.toLowerCase();
  }
  if (
    cleanHex.length !== COMPRESSED_PUBKEY_HEX_LENGTH &&
    cleanHex.length !== UNCOMPRESSED_PUBKEY_HEX_LENGTH
  ) {
    throw new Error(
      `Invalid public key length: ${cleanHex.length} (expected ${X_ONLY_PUBKEY_HEX_LENGTH}, ${COMPRESSED_PUBKEY_HEX_LENGTH}, or ${UNCOMPRESSED_PUBKEY_HEX_LENGTH} hex chars)`,
    );
  }
  return cleanHex
    .slice(
      SEC1_PREFIX_HEX_LENGTH,
      SEC1_PREFIX_HEX_LENGTH + X_ONLY_PUBKEY_HEX_LENGTH,
    )
    .toLowerCase();
}

interface BtcPublicKeyState {
  /**
   * X-only public key (32 bytes, 64 lowercase hex chars, no 0x prefix),
   * suitable for vault provider RPC calls. `undefined` while disconnected,
   * still fetching, or after a failed wallet read.
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
      return { publicKey: canonicalizeBtcPubkey(publicKeyHex), error: null };
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
