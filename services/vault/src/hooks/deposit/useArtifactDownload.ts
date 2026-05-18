import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  JsonRpcError,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useRef, useState } from "react";
import type { Hex } from "viem";

import { ensureAuthenticatedVpClient } from "@/hooks/deposit/depositFlowSteps/ensureAuthenticatedVpClient";
import { isPreDepositorSignaturesError } from "@/models/peginStateMachine";
import { fetchAndDownloadArtifacts } from "@/services/artifacts";
import { markArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

const ARTIFACT_RETRY_INTERVAL_MS = 10_000;

/** Wire-format marker the VP server emits when a previously-issued bearer expires. */
const AUTH_EXPIRED_DATA_KIND = "auth_expired";

interface ArtifactDownloadState {
  loading: boolean;
  progress: string;
  error: string | null;
  downloaded: boolean;
}

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
  vaultId?: string;
  primeContext?: PrimeContext | null;
}) {
  const vaultId = options?.vaultId;
  const primeContext = options?.primeContext ?? null;

  const btcConnector = useChainConnector("BTC");
  const btcWalletFromConnector =
    (btcConnector?.connectedWallet?.provider as BitcoinWallet | undefined) ??
    null;

  const [state, setState] = useState<ArtifactDownloadState>({
    loading: false,
    progress: "",
    error: null,
    downloaded: false,
  });

  // TODO: Remove cancelledRef once the backend delivers artifacts via streaming
  // instead of a single oversized RPC response (~450 MB). Until then, the
  // download reliably times out and users need a way to dismiss the modal.
  const cancelledRef = useRef(false);

  const download = useCallback(
    async (providerAddress: string, peginTxid: string, depositorPk: string) => {
      cancelledRef.current = false;
      setState({
        loading: true,
        progress: "Fetching artifacts from vault provider...",
        error: null,
        downloaded: false,
      });

      const normalizedPeginTxid = stripHexPrefix(peginTxid);
      let primeAttempted = false;

      const tryPrimeAndRetry = async (): Promise<boolean> => {
        // Prime context isn't always available (e.g. collateral re-download
        // path that lacks `unsignedPrePeginTx`); fall through to the raw
        // error in that case.
        const wallet = primeContext?.btcWallet ?? btcWalletFromConnector;
        if (
          !primeContext ||
          !wallet ||
          !primeContext.vaultId ||
          !primeContext.unsignedPrePeginTxHex
        ) {
          return false;
        }

        setState((prev) => ({
          ...prev,
          progress: "Re-authenticating with vault provider...",
        }));

        // Drop any cached token so the next acquire goes back to the server.
        // Covers the hot-but-stale case (auth_expired); harmless on cold cache.
        vpTokenRegistry.peek(normalizedPeginTxid)?.invalidate();

        await ensureAuthenticatedVpClient({
          btcWallet: wallet,
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
          );

          if (cancelledRef.current) return;
          if (vaultId) {
            markArtifactsDownloaded(vaultId);
          }
          setState({
            loading: false,
            progress: "",
            error: null,
            downloaded: true,
          });
          return;
        } catch (err) {
          if (isPreDepositorSignaturesError(err)) {
            setState((prev) => ({
              ...prev,
              progress: "Waiting for vault provider to process signatures...",
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
                  progress: "Fetching artifacts from vault provider...",
                }));
                continue;
              }
            } catch (primeErr) {
              if (cancelledRef.current) return;
              setState({
                loading: false,
                progress: "",
                error:
                  primeErr instanceof Error
                    ? primeErr.message
                    : "Re-authentication failed",
                downloaded: false,
              });
              return;
            }
          }

          if (cancelledRef.current) return;
          setState({
            loading: false,
            progress: "",
            error: err instanceof Error ? err.message : "Download failed",
            downloaded: false,
          });
          return;
        }
      }
    },
    [vaultId, primeContext, btcWalletFromConnector],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setState({
      loading: false,
      progress: "",
      error: null,
      downloaded: false,
    });
  }, []);

  const reset = useCallback(() => {
    setState({
      loading: false,
      progress: "",
      error: null,
      downloaded: false,
    });
  }, []);

  return {
    ...state,
    download,
    cancel,
    reset,
  };
}
