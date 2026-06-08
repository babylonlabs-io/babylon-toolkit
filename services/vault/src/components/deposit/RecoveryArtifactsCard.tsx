import { Loader } from "@babylonlabs-io/core-ui";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { IoDownloadOutline } from "react-icons/io5";
import type { Hex } from "viem";

import { ProgressBar } from "@/components/simple/DepositProgressView/ProgressBar";
import { COPY } from "@/copy";
import { useArtifactDownload } from "@/hooks/deposit/useArtifactDownload";
import { hasArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * 1024 * 1024;

// Brand orange (Tailwind's `secondary-main` token), inlined because
// ProgressBar takes a raw CSS color rather than a class name.
const PROGRESS_BAR_FILL_COLOR = "#CE6533";

function RecoveryArtifactsIcon() {
  return (
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
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= BYTES_PER_GB) {
    return `${(bytes / BYTES_PER_GB).toFixed(2)} GB`;
  }
  if (bytes >= BYTES_PER_MB) {
    return `${Math.round(bytes / BYTES_PER_MB)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

interface RecoveryArtifactsCardProps {
  providerAddress: string;
  peginTxid: string;
  depositorPk: string;
  vaultId: Hex;
  /**
   * Unsigned Pre-PegIn tx hex (from indexer). When provided alongside a
   * connected BTC wallet, the card can transparently re-authenticate
   * with the vault provider on a cold token-registry cache (e.g. after
   * a page reload) by deriving a fresh auth anchor.
   */
  unsignedPrePeginTxHex?: string;
  /** Fired the first time the artifact download completes within this card. */
  onDownloaded?: () => void;
  /**
   * Fired whenever the in-card download flag flips. Lets a parent modal
   * swap its own title/body/footer copy in lockstep with the card so the
   * whole dialog reads as a single "downloading" state.
   */
  onLoadingChange?: (loading: boolean) => void;
}

/**
 * Imperative handle exposed via ref. Lets the parent modal cancel any
 * in-flight artifact download from its own close paths (X button, footer
 * Cancel) so dismissing the modal doesn't leave the oversized RPC running.
 */
export interface RecoveryArtifactsCardHandle {
  cancel: () => void;
}

export const RecoveryArtifactsCard = forwardRef<
  RecoveryArtifactsCardHandle,
  RecoveryArtifactsCardProps
>(function RecoveryArtifactsCard(
  {
    providerAddress,
    peginTxid,
    depositorPk,
    vaultId,
    unsignedPrePeginTxHex,
    onDownloaded,
    onLoadingChange,
  },
  ref,
) {
  const btcConnector = useChainConnector("BTC");
  const btcWallet =
    (btcConnector?.connectedWallet?.provider as BitcoinWallet | undefined) ??
    null;

  const primeContext = useMemo(() => {
    if (!btcWallet || !unsignedPrePeginTxHex) return null;
    return { vaultId, unsignedPrePeginTxHex, btcWallet };
  }, [btcWallet, unsignedPrePeginTxHex, vaultId]);

  const {
    loading,
    progress,
    error,
    downloaded,
    receivedBytes,
    totalBytes,
    download,
    cancel,
  } = useArtifactDownload({ vaultId, primeContext });

  useImperativeHandle(ref, () => ({ cancel }), [cancel]);

  const persisted = hasArtifactsDownloaded(vaultId);
  const isDownloaded = downloaded || persisted;

  const notifiedRef = useRef(false);
  useEffect(() => {
    if (downloaded && !notifiedRef.current) {
      notifiedRef.current = true;
      onDownloaded?.();
    }
  }, [downloaded, onDownloaded]);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  const handleDownload = () => {
    download(providerAddress, peginTxid, depositorPk);
  };

  // While the download is in flight, the parent modal swaps its own
  // title/body/footer (see ArtifactDownloadModal) and we drop the icon
  // header + inline Cancel link — the modal's footer button handles
  // cancellation. The container styling stays consistent across states
  // so the box position in the dialog doesn't jump.
  if (loading) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-4">
        {totalBytes > 0 ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
                <span>{formatBytes(receivedBytes)}</span>
                <span className="text-accent-secondary">
                  {" / "}
                  {formatBytes(totalBytes)}
                </span>
              </span>
              <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-secondary">
                {Math.min(100, Math.round((receivedBytes / totalBytes) * 100))}%
              </span>
            </div>
            <ProgressBar
              percent={Math.min(1, receivedBytes / totalBytes)}
              color={PROGRESS_BAR_FILL_COLOR}
            />
            <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-primary">
              {COPY.deposit.recoveryArtifacts.doNotCloseHint}
            </span>
          </>
        ) : (
          <div className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-secondary-strokeLight bg-neutral-200 px-4 text-accent-primary">
            <Loader size={16} />
            <span className="text-sm leading-[1.43] tracking-[0.17px]">
              {progress || COPY.deposit.recoveryArtifacts.downloadingButton}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-4">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-11 w-[47px] shrink-0 items-center justify-center rounded-lg text-white ${
            isDownloaded ? "bg-success-main" : "bg-secondary-main"
          }`}
        >
          <RecoveryArtifactsIcon />
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
              {isDownloaded
                ? COPY.deposit.recoveryArtifacts.cardSizeDownloaded
                : COPY.deposit.recoveryArtifacts.cardSize}
            </span>
          </div>
        </div>
      </div>

      {!isDownloaded && (
        <div className="flex flex-col items-stretch">
          <button
            type="button"
            onClick={handleDownload}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-secondary-strokeLight bg-neutral-200 px-4 text-accent-primary transition-colors hover:bg-secondary-highlight"
          >
            <IoDownloadOutline size={20} />
            <span className="text-sm leading-[1.43] tracking-[0.17px]">
              {error
                ? COPY.deposit.recoveryArtifacts.retryButton
                : COPY.deposit.recoveryArtifacts.downloadButton}
            </span>
          </button>
          {!error && (
            <span className="mt-2.5 text-center text-xs text-accent-secondary">
              {COPY.deposit.recoveryArtifacts.walletSignatureHint}
            </span>
          )}
        </div>
      )}

      {error && (
        <span className="text-sm leading-[1.43] tracking-[0.17px] text-error-main">
          {error}
        </span>
      )}
    </div>
  );
});
