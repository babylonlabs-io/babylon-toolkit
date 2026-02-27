import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ResponsiveDialog,
  Text,
  Warning,
} from "@babylonlabs-io/core-ui";

import { useArtifactDownload } from "@/hooks/deposit/useArtifactDownload";

interface ArtifactDownloadModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  providerUrl: string;
  peginTxid: string;
  depositorPk: string;
}

export function ArtifactDownloadModal({
  open,
  onClose,
  onComplete,
  providerUrl,
  peginTxid,
  depositorPk,
}: ArtifactDownloadModalProps) {
  const { loading, progress, error, downloaded, download, reset } =
    useArtifactDownload();

  const handleDownload = () => {
    download(providerUrl, peginTxid, depositorPk);
  };

  const handleComplete = () => {
    reset();
    onComplete();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <ResponsiveDialog open={open} onClose={handleClose}>
      <DialogHeader
        title="Download Vault Artifacts"
        onClose={handleClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-4 pt-4 text-accent-primary sm:px-6">
        {!downloaded && !loading && (
          <>
            <Text variant="body2" className="text-accent-secondary">
              Before broadcasting your Bitcoin transaction, you need to download
              your vault artifacts. These files are required to independently
              claim your funds if the vault provider is unavailable.
            </Text>

            <Warning>
              Store these files safely on your local disk or external drive. If
              you lose them and the vault provider goes offline, you will not be
              able to independently claim your funds.
            </Warning>
          </>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader size={24} />
            <Text variant="body2" className="text-accent-secondary">
              {progress}
            </Text>
          </div>
        )}

        {downloaded && (
          <div className="flex flex-col gap-3 py-4">
            <Text variant="body2" className="text-accent-secondary">
              Artifacts downloaded successfully. Please save the file to a safe
              location before continuing.
            </Text>
          </div>
        )}

        {error && (
          <Text variant="body2" className="text-sm text-error-main">
            {error}
          </Text>
        )}
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        {!downloaded ? (
          <Button
            variant="contained"
            className="w-full"
            onClick={handleDownload}
            disabled={loading}
          >
            {loading ? "Downloading..." : "Download Artifacts"}
          </Button>
        ) : (
          <Button
            variant="contained"
            className="w-full"
            onClick={handleComplete}
          >
            Continue
          </Button>
        )}
      </DialogFooter>
    </ResponsiveDialog>
  );
}
