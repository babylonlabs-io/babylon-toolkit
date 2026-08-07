import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  isAuthRejectedError,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { useCallback, useRef, useState } from "react";
import type { Hex } from "viem";

import { COPY } from "@/copy";
import {
  demoFetchAndDownloadArtifacts,
  isArtifactDownloadDemoEnabled,
} from "@/dev/demoArtifactDownload";
import { ensureAuthenticatedVpClient } from "@/hooks/deposit/depositFlowSteps/ensureAuthenticatedVpClient";
import { logger } from "@/infrastructure";
import {
  captureFunnelFailure,
  shortId,
  TELEMETRY_EVENT,
  TELEMETRY_STAGE,
} from "@/infrastructure/telemetryEvents";
import { isPreDepositorSignaturesError } from "@/models/peginStateMachine";
import {
  ArtifactDownloadCancelledError,
  type ArtifactDownloadOutcome,
  ArtifactDownloadTooLargeError,
  ArtifactFileAccessError,
  type ArtifactSaveTarget,
  fetchAndDownloadArtifacts,
  type FetchArtifactsOptions,
  openArtifactSaveTarget,
} from "@/services/artifacts";
import {
  ARTIFACT_RECEIPT_VERSION,
  hasArtifactsDownloaded,
  normalizePeginTxid,
  saveArtifactDownloadReceipt,
} from "@/utils/artifactDownloadStorage";

const ARTIFACT_RETRY_INTERVAL_MS = 10_000;

/**
 * "VP still processing" retries before the stall event fires — ~5 minutes at
 * the 10s interval. The loop keeps retrying past this (the VP may genuinely
 * still finish); the threshold only bounds how long the stall stays invisible
 * to monitoring. Emitted once per download attempt.
 */
const ARTIFACT_STALL_EVENT_ATTEMPTS = 30;

interface ArtifactDownloadState {
  loading: boolean;
  progress: string;
  error: string | null;
  /**
   * A validated bundle reached disk and a receipt was written. This is the
   * only success signal the activation gate accepts, so it must never be set
   * from a path that cannot prove the file was saved.
   */
  downloaded: boolean;
  /**
   * The file was handed to the browser but we cannot prove it was saved (the
   * anchor fallback, or a mocked download). Drives the card's "we can't
   * confirm this" state and nothing else — it must never satisfy the gate.
   */
  delivered: boolean;
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
  delivered: false,
  receivedBytes: 0,
  totalBytes: 0,
};

interface PrimeContext {
  vaultId: Hex;
  unsignedPrePeginTxHex: string;
  btcWallet: BitcoinWallet;
}

export function useArtifactDownload(options?: {
  vaultId?: Hex;
  primeContext?: PrimeContext | null;
}) {
  const vaultId = options?.vaultId;
  const primeContext = options?.primeContext ?? null;

  const [state, setState] = useState<ArtifactDownloadState>(INITIAL_STATE);

  // Always points at the LATEST flow's controller so cancel() aborts it.
  // Aborting stops both the request itself (threaded into callRaw -> fetch)
  // and the in-flight stream (polled by fetchAndDownloadArtifacts between
  // chunks via `isCancelled`), so cancel actually releases the connection
  // instead of letting it run to completion in the background.
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Turn a completed download into the stored receipt that the activation
   * gate reads. Only ever called with an outcome from a validated, saved
   * bundle — never from a fetch that merely resolved.
   */
  const persistReceipt = useCallback(
    (peginTxid: string, outcome: ArtifactDownloadOutcome) => {
      if (!vaultId) return;
      // Milestone only on the first real download — re-downloads are a
      // routine user action, not funnel progress.
      const firstDownload = !hasArtifactsDownloaded(vaultId, peginTxid);
      saveArtifactDownloadReceipt(vaultId, {
        version: ARTIFACT_RECEIPT_VERSION,
        peginTxid: normalizePeginTxid(peginTxid),
        filename: outcome.filename,
        byteLength: outcome.byteLength,
        sha256: outcome.sha256,
        savedAt: Date.now(),
        method: outcome.method,
      });
      if (firstDownload) {
        logger.event(TELEMETRY_EVENT.ACTIVATION_ARTIFACTS_DOWNLOADED, {
          level: "info",
          category: "activation",
          tags: { vaultId: shortId(vaultId) },
        });
      }
    },
    [vaultId],
  );

  const download = useCallback(
    async (providerAddress: string, peginTxid: string, depositorPk: string) => {
      // Dev/QA-only simulation of the artifact fetch (never reaches a VP),
      // so the dialogs' progress states can be exercised. Opted into via the
      // god-mode panel's "Mock artifact download" toggle; off in production
      // builds, where the god-mode gate is compile-time false.
      const demoDownload = isArtifactDownloadDemoEnabled();

      // DO NOT REORDER: showSaveFilePicker() requires transient user
      // activation, which any preceding `await` destroys. Opening the save
      // target has to be the first thing this handler does, while the click
      // that triggered it is still the active gesture. The promise is awaited
      // further down, once the synchronous setup is out of the way.
      //
      // The demo path opens a real save target too — it writes a real (if
      // synthetic) file through the real pipeline, and only skips the network.
      const saveTargetPromise = openArtifactSaveTarget(peginTxid);

      // Each invocation owns its controller, and staleness is derived from
      // it rather than a shared flag: a cancelled flow parked in a
      // non-abortable await (wallet prime, retry sleep) stays permanently
      // stale, so it can never resurrect and clobber the state of a newer
      // download started after the cancel.
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const isStale = () =>
        abortController.signal.aborted ||
        abortControllerRef.current !== abortController;
      setState({
        ...INITIAL_STATE,
        loading: true,
        // The save dialog is already open at this point, so the first status
        // the user sees names it rather than the fetch behind it.
        progress: COPY.deposit.recoveryArtifacts.choosingSaveLocation,
      });

      const normalizedPeginTxid = stripHexPrefix(peginTxid);

      // Per-vault join key for telemetry. The collateral re-download path
      // mounts the hook without a vaultId; the pegin txid identifies the same
      // deposit and is public on-chain data (shortened before emission anyway).
      const telemetryVaultId = vaultId ?? normalizedPeginTxid;

      // Stop the flow with an error message. Used by every fail path
      // below so the rendered modal state stays consistent.
      const setError = (message: string) =>
        setState({
          ...INITIAL_STATE,
          error: message,
        });

      // Resolve the save location before priming, so the user answers the
      // file dialog and the wallet prompt in that order rather than both at
      // once.
      let saveTarget: ArtifactSaveTarget;
      try {
        saveTarget = await saveTargetPromise;
      } catch (err) {
        if (err instanceof ArtifactDownloadCancelledError) {
          setState(INITIAL_STATE);
          return;
        }
        if (isStale()) return;
        captureFunnelFailure(
          TELEMETRY_STAGE.ACTIVATION_ARTIFACTS,
          err,
          telemetryVaultId,
          { tags: { site: "save_target" } },
        );
        setError(
          err instanceof Error
            ? err.message
            : COPY.deposit.recoveryArtifacts.fileAccessDenied,
        );
        return;
      }
      if (isStale()) return;
      setState((prev) => ({
        ...prev,
        progress: COPY.deposit.recoveryArtifacts.fetchingArtifacts,
      }));

      // The demo yields no outcome, which is what keeps a simulated download
      // from ever writing the receipt that satisfies the activation gate.
      const runDownload = (
        fetchOptions: FetchArtifactsOptions,
      ): Promise<ArtifactDownloadOutcome | null> =>
        demoDownload
          ? demoFetchAndDownloadArtifacts(
              saveTarget,
              { peginTxid: normalizedPeginTxid, depositorPk },
              fetchOptions,
            ).then(() => null)
          : fetchAndDownloadArtifacts(
              providerAddress,
              peginTxid,
              depositorPk,
              saveTarget,
              fetchOptions,
            );

      // Ensure the bearer is in cache before any artifact request. The
      // RPC is auth-gated server-side (AUTH_GATED_METHODS), so a
      // cold-cache attempt would be dead on arrival — prime once
      // upfront so every fetchAndDownloadArtifacts() below goes out
      // with a valid Authorization header. Returns false (with state
      // already set) if the prime fails or the caller cancels during
      // the await.
      const ensurePrimedOrFail = async (): Promise<boolean> => {
        // The simulated fetch never talks to a vault provider, so it needs
        // no bearer (and must not prompt the wallet for one).
        if (demoDownload) return true;
        if (vpTokenRegistry.peek(normalizedPeginTxid)) return true;
        if (!primeContext) {
          // A surface mounted the card without the prime inputs and the token
          // cache is cold: every attempt is dead on arrival. A flow-wiring
          // bug, not a user action — capture it.
          captureFunnelFailure(
            TELEMETRY_STAGE.ACTIVATION_ARTIFACTS,
            new Error(
              "Artifact download attempted with a cold token registry and no prime context",
            ),
            telemetryVaultId,
            { tags: { site: "cold_registry" } },
          );
          setError(COPY.deposit.recoveryArtifacts.cannotAuthenticate);
          return false;
        }
        // The cold-cache prime asks the BTC wallet for a signature; surface
        // that as the card's status while the wallet prompt is up.
        setState((prev) => ({
          ...prev,
          progress: COPY.deposit.recoveryArtifacts.signTransaction,
        }));
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
          // Includes the on-chain prePeginTxHash mismatch guard — a potential
          // compromised-indexer signal that must not stay UI-only. Wallet
          // declines are filtered inside captureFunnelFailure.
          captureFunnelFailure(
            TELEMETRY_STAGE.ACTIVATION_ARTIFACTS,
            primeErr,
            telemetryVaultId,
            { tags: { site: "prime" } },
          );
          setError(
            primeErr instanceof Error
              ? primeErr.message
              : COPY.deposit.recoveryArtifacts.authenticationFailed,
          );
          return false;
        }
        if (isStale()) return false;
        // Signature done — back to the fetch status for the artifact request.
        setState((prev) => ({
          ...prev,
          progress: COPY.deposit.recoveryArtifacts.fetchingArtifacts,
        }));
        return true;
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

      let stillProcessingAttempts = 0;
      let stallEventEmitted = false;

      while (true) {
        if (isStale()) return;

        try {
          const outcome = await runDownload({
            onProgress: (receivedBytes, totalBytes) => {
              // Drop progress events that arrive after cancel — they would
              // otherwise re-show the bar after the UI has reset.
              if (isStale()) return;
              setState((prev) =>
                prev.loading ? { ...prev, receivedBytes, totalBytes } : prev,
              );
            },
            isCancelled: isStale,
            signal: abortController.signal,
          });

          if (isStale()) return;

          // No outcome means a mocked download: nothing was validated and no
          // file was written, so it must not satisfy the real activation gate.
          // `delivered` drives the demo UI without ever claiming proof.
          if (!outcome) {
            setState({ ...INITIAL_STATE, delivered: true });
            return;
          }

          if (outcome.method === "browser-download") {
            // The anchor path only proves a link was clicked: the browser
            // reports nothing about whether the file reached disk, and it may
            // have been blocked or the save dialog dismissed. So this reports
            // `delivered`, not `downloaded` — the card says the save could not
            // be confirmed, the risk acknowledgement stays required, and the
            // vault keeps warning until there is real evidence. Setting
            // `downloaded` here would let a click satisfy the activation gate,
            // which is the exact substitution this flow exists to remove.
            setState({ ...INITIAL_STATE, delivered: true });
            return;
          }

          // The one path with real evidence: validated, streamed to a file the
          // user chose, and receipted.
          persistReceipt(peginTxid, outcome);
          setState({
            ...INITIAL_STATE,
            downloaded: true,
          });
          return;
        } catch (err) {
          if (err instanceof ArtifactDownloadCancelledError) return;
          if (isStale()) return;

          // Terminal by nature: neither re-priming nor waiting changes a
          // refused file handle or a body too large for this browser.
          if (err instanceof ArtifactDownloadTooLargeError) {
            captureFunnelFailure(
              TELEMETRY_STAGE.ACTIVATION_ARTIFACTS,
              err,
              telemetryVaultId,
              { tags: { site: "too_large" } },
            );
            setError(COPY.deposit.recoveryArtifacts.tooLargeForBrowser);
            return;
          }
          if (err instanceof ArtifactFileAccessError) {
            captureFunnelFailure(
              TELEMETRY_STAGE.ACTIVATION_ARTIFACTS,
              err,
              telemetryVaultId,
              { tags: { site: "file_sink" } },
            );
            setError(err.message);
            return;
          }

          if (isPreDepositorSignaturesError(err)) {
            stillProcessingAttempts += 1;
            if (
              !stallEventEmitted &&
              stillProcessingAttempts >= ARTIFACT_STALL_EVENT_ATTEMPTS
            ) {
              stallEventEmitted = true;
              logger.event(TELEMETRY_EVENT.ACTIVATION_ARTIFACTS_STALLED, {
                level: "warning",
                category: "activation",
                tags: { vaultId: shortId(telemetryVaultId) },
                attempts: stillProcessingAttempts,
              });
            }
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

          // Artifact download goes through `callRaw`, which deliberately
          // skips the client's reactive re-auth (the body may be unbounded,
          // so it is never parsed to detect an auth error). This is that
          // recovery, done by hand: re-prime the token registry once and
          // retry the stream.
          if (!primeAttempted && isAuthRejectedError(err)) {
            primeAttempted = true;
            try {
              const primed = await tryPrimeAndRetry();
              if (primed && !isStale()) {
                setState((prev) => ({
                  ...prev,
                  progress: COPY.deposit.recoveryArtifacts.fetchingArtifacts,
                }));
                continue;
              }
            } catch (primeErr) {
              if (isStale()) return;
              captureFunnelFailure(
                TELEMETRY_STAGE.ACTIVATION_ARTIFACTS,
                primeErr,
                telemetryVaultId,
                { tags: { site: "reprime" } },
              );
              setError(
                primeErr instanceof Error
                  ? primeErr.message
                  : COPY.deposit.recoveryArtifacts.reauthenticationFailed,
              );
              return;
            }
          }

          if (isStale()) return;
          // Terminal download failure: wire/HTTP auth rejections past the one
          // re-prime retry, envelope-validation rejections, exhausted network
          // retries, mid-stream failures. Cancellation returned above.
          captureFunnelFailure(
            TELEMETRY_STAGE.ACTIVATION_ARTIFACTS,
            err,
            telemetryVaultId,
            { tags: { site: "download" } },
          );
          setError(
            err instanceof Error
              ? err.message
              : COPY.deposit.recoveryArtifacts.downloadFailed,
          );
          return;
        }
      }
    },
    [vaultId, primeContext, persistReceipt],
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    download,
    cancel,
  };
}
