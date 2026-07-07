import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  ResponsiveDialog,
} from "@babylonlabs-io/core-ui";
import { useEffect, useRef, useState } from "react";
import type { Hex } from "viem";

import {
  RecoveryArtifactsCard,
  type RecoveryArtifactsCardHandle,
} from "@/components/deposit/RecoveryArtifactsCard";
import { COPY } from "@/copy";
import { hasArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

// The modal states share the document-with-folded-corner outline and differ
// only in the inner glyph: a shield before the download starts, a download
// arrow while it streams, a checkmark once the artifacts are on disk.
const MODAL_ICON_GLYPHS = {
  pending:
    "M50.625 58.5C50.625 56.4999 63.75 52.5 63.75 52.5C63.75 52.5 76.875 56.4999 76.875 58.5C76.875 74.4999 63.75 82.5 63.75 82.5C63.75 82.5 50.625 74.4999 50.625 58.5Z",
  downloading:
    "M63.75 52.5V75M50.625 61.875L63.75 75L76.875 61.875M50.625 82.5H76.875",
  downloaded: "M48.75 71.25L60 80.625L76.875 60",
} as const;

function ArtifactModalIcon({
  glyph,
}: {
  glyph: keyof typeof MODAL_ICON_GLYPHS;
}) {
  return (
    <svg
      width="90"
      height="90"
      viewBox="0 0 90 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-accent-primary"
      aria-hidden="true"
    >
      <path
        d="M75 43.125V26.25L58.125 7.5H18.75C16.6789 7.5 15 9.17893 15 11.25V78.75C15 80.8211 16.6789 82.5 18.75 82.5H41.25"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={MODAL_ICON_GLYPHS[glyph]}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M56.25 7.5V26.25H75"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Static summary card for the downloaded state. Unlike RecoveryArtifactsCard
 * it carries no download logic — by the time it renders the files are on
 * disk, so it only confirms what was saved.
 */
function DownloadedArtifactsCard() {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-4">
      <div className="flex h-11 w-[47px] shrink-0 items-center justify-center rounded-lg bg-success-dark text-white">
        <svg
          width="27"
          height="24"
          viewBox="0 0 27 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M22.5 11.5V7L17.4375 2H5.625C5.00368 2 4.5 2.44771 4.5 3V21C4.5 21.5523 5.00368 22 5.625 22H12.375"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M15.1875 15.6C15.1875 15.0667 19.125 14 19.125 14C19.125 14 23.0625 15.0667 23.0625 15.6C23.0625 19.8667 19.125 22 19.125 22C19.125 22 15.1875 19.8667 15.1875 15.6Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M16.875 2V7H22.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
          {COPY.deposit.recoveryArtifacts.cardTitle}
        </span>
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-base leading-[1.5] tracking-[0.15px] text-accent-secondary">
            {COPY.deposit.recoveryArtifacts.cardSubtitle}
          </span>
          <span className="shrink-0 text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
            {COPY.deposit.recoveryArtifacts.cardSizeDownloaded}
          </span>
        </div>
      </div>
    </div>
  );
}

/** The vault-provider routing inputs an artifact download needs. */
export interface ArtifactDownloadModalParams {
  providerAddress: string;
  peginTxid: string;
  depositorPk: string;
}

interface ArtifactDownloadModalBaseProps extends ArtifactDownloadModalParams {
  open: boolean;
  onClose: () => void;
  vaultId: Hex;
  /**
   * Unsigned Pre-PegIn tx hex (from indexer). When provided alongside a
   * connected BTC wallet, the modal can transparently re-authenticate
   * with the vault provider on a cold token-registry cache (e.g. after
   * a page reload) by deriving a fresh auth anchor. When omitted, a
   * stale/missing-bearer rejection surfaces to the user as a raw error
   * and they must restart the deposit flow to recover.
   */
  unsignedPrePeginTxHex?: string;
}

/**
 * The downloaded state offers exactly one completion action. `onComplete`
 * renders a single Continue button (collateral list — the vault is already
 * active, so confirming the download is all there is to do). `onActivate`
 * renders the Cancel + "Activate vault" pair (activation flow, where
 * confirming the download proceeds to vault activation).
 */
type ArtifactDownloadModalProps = ArtifactDownloadModalBaseProps &
  (
    | { onComplete: () => void; onActivate?: undefined }
    | { onActivate: () => void; onComplete?: undefined }
  );

export function ArtifactDownloadModal({
  open,
  onClose,
  onComplete,
  onActivate,
  providerAddress,
  peginTxid,
  depositorPk,
  vaultId,
  unsignedPrePeginTxHex,
}: ArtifactDownloadModalProps) {
  // Seed from localStorage so a reopened modal for an already-downloaded
  // vault renders the downloaded confirmation immediately. Re-seeded whenever
  // the modal opens against a different vault.
  const [downloaded, setDownloaded] = useState(() =>
    hasArtifactsDownloaded(vaultId),
  );
  // Mirrors RecoveryArtifactsCard's internal `loading` flag via
  // onLoadingChange so the whole modal (icon, title, body, footer) reads as
  // a single "downloading" state once the user kicks off the request.
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (open) {
      setDownloaded(hasArtifactsDownloaded(vaultId));
      setIsDownloading(false);
    }
  }, [open, vaultId]);

  const cardRef = useRef<RecoveryArtifactsCardHandle>(null);

  // Cancel any in-flight artifact download before the modal unmounts so a
  // dismissed dialog doesn't leave the oversized RPC running in the
  // background (and surprise the user with a file save later).
  const handleClose = () => {
    cardRef.current?.cancel();
    onClose();
  };

  // In-place cancel: aborts the download but keeps the modal open. The
  // hook's cancel() resets its state, which flips `isDownloading` back via
  // onLoadingChange and restores the pre-download copy and the card's
  // Download button. Dismissal paths (the X button) still go through
  // handleClose.
  const handleCancelDownload = () => {
    cardRef.current?.cancel();
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={handleClose}
      className="w-[564px] max-w-full"
      dialogClassName="!rounded-2xl"
    >
      <DialogHeader
        title=""
        onClose={handleClose}
        // Float the close (×) button at the top-right with no border, so the
        // title row sits absolutely over the body padding (matches the design).
        className="text-accent-primary [&_.bbn-dialog-title]:!absolute [&_.bbn-dialog-title]:!right-5 [&_button]:!border-0"
      />

      <DialogBody className="flex flex-col items-stretch gap-10 px-6 pb-2 pt-2 text-accent-primary">
        {downloaded ? (
          <div className="flex flex-col items-center gap-10">
            <ArtifactModalIcon glyph="downloaded" />
            <div className="flex w-full flex-col items-center gap-4">
              <h2 className="text-center text-[34px] font-normal leading-[1.235] tracking-[0.25px] text-accent-primary">
                {COPY.deposit.artifactDownload.titleDownloaded}
              </h2>
              <p className="text-center text-xl font-normal leading-[1.6] tracking-[0.15px] text-accent-secondary">
                {COPY.deposit.artifactDownload.bodyDownloaded}
              </p>
            </div>
          </div>
        ) : isDownloading ? (
          <div className="flex flex-col items-center gap-10">
            <ArtifactModalIcon glyph="downloading" />
            <div className="flex w-full flex-col items-center gap-4">
              <h2 className="text-center text-[34px] font-normal leading-[1.235] tracking-[0.25px] text-accent-primary">
                {COPY.deposit.artifactDownload.titleDownloading}
              </h2>
              <p className="text-center text-xl font-normal leading-[1.6] tracking-[0.15px] text-accent-secondary">
                {COPY.deposit.artifactDownload.bodyDownloading}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-10">
            <ArtifactModalIcon glyph="pending" />
            <div className="flex w-full flex-col items-start gap-4">
              <h2 className="text-left text-[34px] font-normal leading-[1.235] tracking-[0.25px] text-accent-primary">
                {COPY.deposit.artifactDownload.title}
              </h2>
              <p className="text-left text-xl font-normal leading-[1.6] tracking-[0.15px] text-accent-secondary">
                {COPY.deposit.artifactDownload.body}
              </p>
            </div>
          </div>
        )}

        {downloaded ? (
          <DownloadedArtifactsCard />
        ) : (
          <RecoveryArtifactsCard
            ref={cardRef}
            providerAddress={providerAddress}
            peginTxid={peginTxid}
            depositorPk={depositorPk}
            vaultId={vaultId}
            unsignedPrePeginTxHex={unsignedPrePeginTxHex}
            onDownloaded={() => setDownloaded(true)}
            onLoadingChange={setIsDownloading}
          />
        )}
      </DialogBody>

      <DialogFooter className="flex flex-row gap-4 px-6 pb-6 pt-4">
        {downloaded && onActivate ? (
          <>
            <Button
              variant="outlined"
              className="h-10 flex-1"
              onClick={handleClose}
            >
              {COPY.deposit.artifactDownload.cancelButton}
            </Button>
            <Button
              variant="contained"
              color="secondary"
              className="h-10 flex-1"
              onClick={onActivate}
            >
              {COPY.deposit.artifactDownload.activateButton}
            </Button>
          </>
        ) : downloaded ? (
          <Button
            variant="contained"
            className="h-10 w-full"
            onClick={onComplete}
          >
            {COPY.deposit.artifactDownload.continueButton}
          </Button>
        ) : (
          <Button
            variant="outlined"
            className="h-10 w-full"
            onClick={isDownloading ? handleCancelDownload : handleClose}
          >
            {isDownloading
              ? COPY.deposit.artifactDownload.cancelDownloadButton
              : COPY.deposit.artifactDownload.cancelButton}
          </Button>
        )}
      </DialogFooter>
    </ResponsiveDialog>
  );
}
