import {
  NEUTRAL_ROW_BUTTON_CLASS,
  PRIMARY_ROW_BUTTON_CLASS,
} from "@/components/shared/buttonClasses";
import { COPY } from "@/copy";
import type { ArtifactDownloadParams } from "@/utils/artifactDownloadParams";
import { hasArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

interface ArtifactDownloadRowButtonProps {
  params: ArtifactDownloadParams;
  onDownload: (params: ArtifactDownloadParams) => void;
}

/**
 * A vault row's artifact download. A receipt records one past save, not that
 * the file still exists, so the action stays after it, in the quieter style.
 */
export function ArtifactDownloadRowButton({
  params,
  onDownload,
}: ArtifactDownloadRowButtonProps) {
  const saved = hasArtifactsDownloaded(params.vaultId, params.peginTxid);
  return (
    <button
      type="button"
      onClick={() => onDownload(params)}
      className={`${saved ? NEUTRAL_ROW_BUTTON_CLASS : PRIMARY_ROW_BUTTON_CLASS} max-md:w-full`}
    >
      {saved
        ? COPY.vaults.actions.downloadArtifactsAgain
        : COPY.vaults.actions.downloadArtifacts}
    </button>
  );
}
