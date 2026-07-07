import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  AUTH_EXPIRED_DATA_KIND,
  JsonRpcError,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { useCallback, useRef, useState } from "react";
import type { Hex } from "viem";

import { COPY } from "@/copy";
import { ensureAuthenticatedVpClient } from "@/hooks/deposit/depositFlowSteps/ensureAuthenticatedVpClient";
import { isPreDepositorSignaturesError } from "@/models/peginStateMachine";
import {
  ArtifactDownloadCancelledError,
  fetchAndDownloadArtifacts,
} from "@/services/artifacts";
import { markArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

const ARTIFACT_RETRY_INTERVAL_MS = 10_000;

interface ArtifactDownloadState {
  loading: boolean;
  progress: string;
  error: string | null;
  downloaded: boolean;
  /** Bytes received so far from the in-flight artifact stream. */
  receivedBytes: number;
  /**
   * Expected total bytes — Content-Length when the server sends it,
   * otherwise the service's fallback estimate. Always defined while
   * `loading` is true.
   */
  totalBytes: number;
}

const INITIAL_STATE: ArtifactDownloadState = {
  loading: false,
  progress: "",
  error: null,
  downloaded: false,
  receivedBytes: 0,
  totalBytes: 0,
};

interface PrimeContext {
  vaultId: Hex;
  unsignedPrePeginTxHex: string;
  btcWallet: BitcoinWallet;
}

/**
 * Returns true when the failure looks like the VP rejected the request
 * because the bearer token was missing, malformed, or expired - i.e.
 * the request can succeed if we re-prime the registry and retry.
 *
 * The structured `auth_expired` marker is the only contractually-defined
 * signal; missing-bearer rejections currently come through as a free-form
 * message, so we accept that case heuristically.
 */
function isAuthFailure(err: unknown): boolean {
  if (!(err instanceof JsonRpcError)) return false;
  if (err.source !== "wire") return false;

  const data = err.data;
  if (
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    (data as { kind?: unknown }).kind === AUTH_EXPIRED_DATA_KIND
  ) {
    return true;
  }

  return /bearer/i.test(err.message);
}

export function useArtifactDownload(options?: {
  vaultId?: Hex;
  primeContext?: PrimeContext | null;
}) {
  const vaultId = options?.vaultId;
  const primeContext = options?.primeContext ?? null;

  const [state, setState] = useState<ArtifactDownloadState>(INITIAL_STATE);

  // Stops both the UI state machine (post-await guards) and the in-flight
  // stream (polled by fetchAndDownloadArtifacts between chunks) so cancel
  // actually releases the connection instead of letting it run to completion
  // in the background.
  const cancelledRef = useRef(false);

  // Aborts the request itself (threaded into callRaw -> fetch). cancelledRef
  // is only polled between chunk reads, so a stalled read on a silent
  // connection would otherwise hang Cancel until the next byte / EOF /
  // timeout; aborting the signal unblocks reader.read() immediately.
  const abortControllerRef = useRef<AbortController | null>(null);

  const download = useCallback(
    async (providerAddress: string, peginTxid: string, depositorPk: string) => {
      cancelledRef.current = false;
      abortControllerRef.current = new AbortController();
      setState({
        ...INITIAL_STATE,
        loading: true,
        progress: COPY.deposit.recoveryArtifacts.fetchingArtifacts,
      });

      const normalizedPeginTxid = stripHexPrefix(peginTxid);

      // Stop the flow with an error message. Used by every fail path
      // below so the rendered modal state stays consistent.
      const setError = (message: string) =>
        setState({
          ...INITIAL_STATE,
          error: message,
        });

      // Ensure the bearer is in cache before any artifact request. The
      // RPC is auth-gated server-side (AUTH_GATED_METHODS), so a
      // cold-cache attempt would be dead on arrival — prime once
      // upfront so every fetchAndDownloadArtifacts() below goes out
      // with a valid Authorization header. Returns false (with state
      // already set) if the prime fails or the caller cancels during
      // the await.
      const ensurePrimedOrFail = async (): Promise<boolean> => {
        if (vpTokenRegistry.peek(normalizedPeginTxid)) return true;
        if (!primeContext) {
          setError(COPY.deposit.recoveryArtifacts.cannotAuthenticate);
          return false;
        }
        try {
          await ensureAuthenticatedVpClient({
            btcWallet: primeContext.btcWallet,
            vaultId: primeContext.vaultId,
            unsignedPrePeginTxHex: primeContext.unsignedPrePeginTxHex,
            peginTxHash: peginTxid,
            providerAddress,
            depositorBtcPubkey: depositorPk,
          });
        } catch (primeErr) {
          if (cancelledRef.current) return false;
          setError(
            primeErr instanceof Error
              ? primeErr.message
              : COPY.deposit.recoveryArtifacts.authenticationFailed,
          );
          return false;
        }
        return !cancelledRef.current;
      };

      if (!(await ensurePrimedOrFail())) return;

      let primeAttempted = false;

      const tryPrimeAndRetry = async (): Promise<boolean> => {
        // Prime context isn't always available (e.g. collateral re-download
        // path that lacks `unsignedPrePeginTx`); fall through to the raw
        // error in that case.
        if (!primeContext) {
          return false;
        }

        setState((prev) => ({
          ...prev,
          progress: COPY.deposit.recoveryArtifacts.reauthenticating,
          // Reset byte counters so the bar doesn't linger between attempts;
          // the next fetchAndDownloadArtifacts call seeds them from 0 again.
          receivedBytes: 0,
          totalBytes: 0,
        }));

        // Drop any cached token so the next acquire goes back to the server.
        // Covers the hot-but-stale case (auth_expired); harmless on cold cache.
        vpTokenRegistry.peek(normalizedPeginTxid)?.invalidate();

        await ensureAuthenticatedVpClient({
          btcWallet: primeContext.btcWallet,
          vaultId: primeContext.vaultId,
          unsignedPrePeginTxHex: primeContext.unsignedPrePeginTxHex,
          peginTxHash: peginTxid,
          providerAddress,
          depositorBtcPubkey: depositorPk,
        });

        return true;
      };

      while (true) {
        if (cancelledRef.current) return;

        try {
          await fetchAndDownloadArtifacts(
            providerAddress,
            peginTxid,
            depositorPk,
            {
              onProgress: (receivedBytes, totalBytes) => {
                // Drop progress events that arrive after cancel — they would
                // otherwise re-show the bar after the UI has reset.
                if (cancelledRef.current) return;
                setState((prev) =>
                  prev.loading ? { ...prev, receivedBytes, totalBytes } : prev,
                );
              },
              isCancelled: () => cancelledRef.current,
              signal: abortControllerRef.current?.signal,
            },
          );

          if (cancelledRef.current) return;
          if (vaultId) {
            markArtifactsDownloaded(vaultId);
          }
          setState({
            ...INITIAL_STATE,
            downloaded: true,
          });
          return;
        } catch (err) {
          if (err instanceof ArtifactDownloadCancelledError) return;
          if (isPreDepositorSignaturesError(err)) {
            setState((prev) => ({
              ...prev,
              progress: COPY.deposit.recoveryArtifacts.waitingForSignatures,
              receivedBytes: 0,
              totalBytes: 0,
            }));
            await new Promise((resolve) =>
              setTimeout(resolve, ARTIFACT_RETRY_INTERVAL_MS),
            );
            continue;
          }

          if (!primeAttempted && isAuthFailure(err) && !cancelledRef.current) {
            primeAttempted = true;
            try {
              const primed = await tryPrimeAndRetry();
              if (primed && !cancelledRef.current) {
                setState((prev) => ({
                  ...prev,
                  progress: COPY.deposit.recoveryArtifacts.fetchingArtifacts,
                }));
                continue;
              }
            } catch (primeErr) {
              if (cancelledRef.current) return;
              setError(
                primeErr instanceof Error
                  ? primeErr.message
                  : COPY.deposit.recoveryArtifacts.reauthenticationFailed,
              );
              return;
            }
          }

          if (cancelledRef.current) return;
          setError(
            err instanceof Error
              ? err.message
              : COPY.deposit.recoveryArtifacts.downloadFailed,
          );
          return;
        }
      }
    },
    [vaultId, primeContext],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    abortControllerRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    download,
    cancel,
  };
}
