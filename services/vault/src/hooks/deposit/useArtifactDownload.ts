import { useCallback, useRef, useState } from "react";

import { isPreDepositorSignaturesError } from "@/models/peginStateMachine";
import { fetchAndDownloadArtifacts } from "@/services/artifacts";
import { markArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

const ARTIFACT_RETRY_INTERVAL_MS = 10_000;

interface ArtifactDownloadState {
  loading: boolean;
  progress: string;
  error: string | null;
  downloaded: boolean;
}

export function useArtifactDownload(options?: { vaultId?: string }) {
  const vaultId = options?.vaultId;
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
    [vaultId],
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
