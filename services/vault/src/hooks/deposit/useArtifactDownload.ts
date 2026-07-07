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
import { fetchAndDownloadArtifacts } from "@/services/artifacts";
import { markArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

const ARTIFACT_RETRY_INTERVAL_MS = 10_000;

interface ArtifactDownloadState {
  loading: boolean;
  progress: string;
  error: string | null;
  downloaded: boolean;
  /** Bytes received so far for the in-flight artifact response. */
  receivedBytes: number;
  /** Content-Length of the artifact response; 0 while unknown. */
  totalBytes: number;
}

const IDLE_STATE: ArtifactDownloadState = {
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

  const [state, setState] = useState<ArtifactDownloadState>(IDLE_STATE);

  // Always points at the LATEST flow's controller so cancel() aborts it.
  const abortRef = useRef<AbortController | null>(null);

  const download = useCallback(
    async (providerAddress: string, peginTxid: string, depositorPk: string) => {
      // Each invocation owns its controller, and staleness is derived from
      // it rather than a shared flag: a cancelled flow parked in a
      // non-abortable await (wallet prime, retry sleep) stays permanently
      // stale, so it can never resurrect and clobber the state of a newer
      // download started after the cancel.
      const abortController = new AbortController();
      abortRef.current = abortController;
      const isStale = () =>
        abortController.signal.aborted || abortRef.current !== abortController;
      setState({
        ...IDLE_STATE,
        loading: true,
        progress: COPY.deposit.recoveryArtifacts.fetchingArtifacts,
      });

      const normalizedPeginTxid = stripHexPrefix(peginTxid);

      // Stop the flow with an error message. Used by every fail path
      // below so the rendered modal state stays consistent.
      const setError = (message: string) =>
        setState({ ...IDLE_STATE, error: message });

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
          if (isStale()) return false;
          setError(
            primeErr instanceof Error
              ? primeErr.message
              : COPY.deposit.recoveryArtifacts.authenticationFailed,
          );
          return false;
        }
        return !isStale();
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
        if (isStale()) return;

        try {
          await fetchAndDownloadArtifacts(
            providerAddress,
            peginTxid,
            depositorPk,
            {
              signal: abortController.signal,
              onProgress: (receivedBytes, totalBytes) => {
                if (isStale()) return;
                setState((prev) => ({ ...prev, receivedBytes, totalBytes }));
              },
            },
          );

          if (isStale()) return;
          if (vaultId) {
            markArtifactsDownloaded(vaultId);
          }
          setState({ ...IDLE_STATE, downloaded: true });
          return;
        } catch (err) {
          if (isStale()) return;

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

          if (!primeAttempted && isAuthFailure(err)) {
            primeAttempted = true;
            try {
              const primed = await tryPrimeAndRetry();
              if (primed && !isStale()) {
                setState((prev) => ({
                  ...prev,
                  progress: COPY.deposit.recoveryArtifacts.fetchingArtifacts,
                  receivedBytes: 0,
                  totalBytes: 0,
                }));
                continue;
              }
            } catch (primeErr) {
              if (isStale()) return;
              setError(
                primeErr instanceof Error
                  ? primeErr.message
                  : COPY.deposit.recoveryArtifacts.reauthenticationFailed,
              );
              return;
            }
          }

          if (isStale()) return;
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
    abortRef.current?.abort();
    setState(IDLE_STATE);
  }, []);

  return {
    ...state,
    download,
    cancel,
  };
}
