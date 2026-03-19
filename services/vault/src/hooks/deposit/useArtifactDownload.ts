import { useCallback, useState } from "react";

import { fetchAndDownloadArtifacts } from "@/services/artifacts";

interface ArtifactDownloadState {
  loading: boolean;
  progress: string;
  error: string | null;
  downloaded: boolean;
}

export function useArtifactDownload() {
  const [state, setState] = useState<ArtifactDownloadState>({
    loading: false,
    progress: "",
    error: null,
    downloaded: false,
  });

  const download = useCallback(
    async (providerAddress: string, peginTxid: string, depositorPk: string) => {
      setState({
        loading: true,
        progress: "Fetching artifacts from vault provider...",
        error: null,
        downloaded: false,
      });

      try {
        await fetchAndDownloadArtifacts(
          providerAddress,
          peginTxid,
          depositorPk,
        );

        setState({
          loading: false,
          progress: "",
          error: null,
          downloaded: true,
        });
      } catch (err) {
        setState({
          loading: false,
          progress: "",
          error: err instanceof Error ? err.message : "Download failed",
          downloaded: false,
        });
      }
    },
    [],
  );

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
    reset,
  };
}
