import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useChainConnector } from "@babylonlabs-io/wallet-connector/btc-eth";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { Hex } from "viem";

import { COPY } from "@/copy";
import { useArtifactDownload } from "@/hooks/deposit/useArtifactDownload";
import { isFileSystemAccessSupported } from "@/services/artifacts";
import {
  hasArtifactsDownloaded,
  hasGraphMismatch,
} from "@/utils/artifactDownloadStorage";

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

/**
 * The vault surface's wording for each activation-phrased message. An active
 * vault has no activation, risk acknowledgement or artifact warning left, so
 * those clauses are dropped there.
 */
const VAULT_MESSAGES = new Map<string, string>([
  [
    COPY.deposit.recoveryArtifacts.fallbackSaveHint,
    COPY.deposit.artifactDownload.fallbackSaveHint,
  ],
  [
    COPY.deposit.recoveryArtifacts.unverifiedSaveNotice,
    COPY.deposit.artifactDownload.unverifiedSaveNotice,
  ],
  [
    COPY.deposit.recoveryArtifacts.uncheckedGraphNotice,
    COPY.deposit.artifactDownload.uncheckedGraphNotice,
  ],
  [
    COPY.deposit.recoveryArtifacts.signedGraphMismatch,
    COPY.deposit.artifactDownload.signedGraphMismatch,
  ],
]);

/** Everything the parent needs to render the download in the card's place. */
export interface ArtifactDownloadProgress {
  loading: boolean;
  receivedBytes: number;
  /** 0 until the transfer reports a Content-Length. */
  totalBytes: number;
  /** The hook's status line while the total is still unknown. */
  status: string;
  /** The card's current error line, or null; lets the modal re-probe after a failed download. */
  error: string | null;
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
  /**
   * Fired the first time a download within this card completes with proof:
   * a validated bundle written to a file the user chose, and receipted. This
   * is what satisfies the activation gate, so the unverifiable anchor
   * fallback deliberately does NOT fire it.
   */
  onDownloaded?: () => void;
  /**
   * Fired whenever the in-flight download's state moves. The card renders
   * nothing while `loading`, so this is what lets the parent modal present
   * the download — its own title, body and progress — in place of its
   * activation content.
   */
  onStateChange?: (state: ArtifactDownloadProgress) => void;
  /**
   * Fired the first time a download finds that the provider served a graph
   * other than the one signed at presign. The activation gate must then stop
   * offering the risk opt-out for this vault.
   */
  onGraphMismatch?: () => void;
  /**
   * Where the card is mounted. `activation` gates activating the vault;
   * `vault` downloads for an active vault, or one that expired after Verified,
   * and shows the messages without the activation clauses.
   */
  context?: "activation" | "vault";
}

/**
 * Imperative handle exposed via ref. Lets the parent modal cancel any
 * in-flight artifact download from its own close paths (X button, footer
 * Cancel) so dismissing the modal doesn't leave the oversized RPC running.
 * `download` lets the parent start the download from its own primary button.
 */
export interface RecoveryArtifactsCardHandle {
  cancel: () => void;
  download: () => void;
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
    onStateChange,
    onGraphMismatch,
    context = "activation",
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
    error: downloadError,
    downloaded,
    delivered,
    graphUnchecked,
    graphMismatch,
    receivedBytes,
    totalBytes,
    download,
    cancel,
  } = useArtifactDownload({ vaultId, primeContext });

  // Bound to this pegin: a receipt stored for a different pegin (a stale
  // record, or another vault's) must not read as downloaded here.
  const persisted = hasArtifactsDownloaded(vaultId, peginTxid);
  const isDownloaded = downloaded || persisted;

  // A mismatch found before this card mounted still explains why activation
  // is blocked, so it is shown until a new download replaces it.
  const error =
    downloadError ??
    (hasGraphMismatch(vaultId, peginTxid)
      ? COPY.deposit.recoveryArtifacts.signedGraphMismatch
      : null);

  // A repeat download can fail, or find a mismatch, while an earlier receipt
  // stands. The card must not look saved over that error.
  const showSaved = isDownloaded && !error;

  const message = (text: string) =>
    context === "vault" ? (VAULT_MESSAGES.get(text) ?? text) : text;

  // Browsers without the File System Access API cannot stream to a chosen
  // file, so the user is warned before starting a multi-minute transfer.
  const usesFallbackSave = !isFileSystemAccessSupported();

  // The save could not be confirmed. Never folded into `isDownloaded`, which
  // drives the success presentation and, through onDownloaded, the gate.
  let unconfirmedSaveNotice: string | null = null;
  if (graphUnchecked) {
    // Unproven twice over the fallback, and a confirmed save would not make
    // the kit checked, so this wording promises nothing clears.
    if (usesFallbackSave) {
      unconfirmedSaveNotice =
        COPY.deposit.recoveryArtifacts.uncheckedUnverifiedSaveNotice;
    }
  } else if (delivered && !isDownloaded) {
    // A receipt from an earlier verified download wins over a plain
    // `delivered`, so this never downgrades a proven state.
    unconfirmedSaveNotice = message(
      COPY.deposit.recoveryArtifacts.unverifiedSaveNotice,
    );
  }

  const notifiedRef = useRef(false);
  useEffect(() => {
    if (downloaded && !notifiedRef.current) {
      notifiedRef.current = true;
      onDownloaded?.();
    }
  }, [downloaded, onDownloaded]);

  useEffect(() => {
    onStateChange?.({
      loading,
      receivedBytes,
      totalBytes,
      status: progress,
      error,
    });
  }, [loading, receivedBytes, totalBytes, progress, error, onStateChange]);

  const mismatchNotifiedRef = useRef(false);
  useEffect(() => {
    if (graphMismatch && !mismatchNotifiedRef.current) {
      mismatchNotifiedRef.current = true;
      onGraphMismatch?.();
    }
  }, [graphMismatch, onGraphMismatch]);

  const handleDownload = useCallback(() => {
    download(providerAddress, peginTxid, depositorPk);
  }, [download, providerAddress, peginTxid, depositorPk]);

  useImperativeHandle(ref, () => ({ cancel, download: handleDownload }), [
    cancel,
    handleDownload,
  ]);

  // The parent modal owns the downloading presentation end to end (see
  // ArtifactDownloadContent), so the card renders nothing while bytes
  // stream. It stays mounted: it holds the download hook, and unmounting
  // it would abandon the transfer.
  if (loading) return null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-4">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-11 w-[47px] shrink-0 items-center justify-center rounded-lg text-white ${
            showSaved ? "bg-success-main" : "bg-secondary-main"
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
              {showSaved
                ? COPY.deposit.recoveryArtifacts.cardSizeDownloaded
                : COPY.deposit.recoveryArtifacts.cardSize}
            </span>
          </div>
        </div>
      </div>

      {/* The download finished without proof (the browser cannot confirm the
          save, or the graph was compared with nothing), so no proof is
          reported upward. The unchecked note shows over an older receipt too:
          that receipt says nothing about the file just saved. */}
      {(graphUnchecked || unconfirmedSaveNotice) && (
        <div
          data-testid="artifact-unverified-notice"
          className="flex flex-col gap-2 text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary"
        >
          {graphUnchecked && (
            <span>
              <span className="text-accent-primary">
                {COPY.deposit.recoveryArtifacts.uncheckedGraphTitle}
              </span>{" "}
              {message(COPY.deposit.recoveryArtifacts.uncheckedGraphNotice)}
            </span>
          )}
          {unconfirmedSaveNotice && (
            <span>
              <span className="text-accent-primary">
                {COPY.deposit.recoveryArtifacts.unverifiedSaveTitle}
              </span>{" "}
              {unconfirmedSaveNotice}
            </span>
          )}
        </div>
      )}

      {/* Already spelled out at length by the unverified notice above. */}
      {!isDownloaded && usesFallbackSave && !delivered && (
        <span className="text-center text-xs text-accent-secondary">
          {message(COPY.deposit.recoveryArtifacts.fallbackSaveHint)}
        </span>
      )}

      {error && (
        <span className="text-sm leading-[1.43] tracking-[0.17px] text-error-main">
          {message(error)}
        </span>
      )}
    </div>
  );
});
