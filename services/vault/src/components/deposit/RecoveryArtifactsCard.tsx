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
import {
  IoCheckmarkCircle,
  IoDocumentText,
  IoDownloadOutline,
} from "react-icons/io5";
import type { Hex } from "viem";

import { COPY } from "@/copy";
import { useArtifactDownload } from "@/hooks/deposit/useArtifactDownload";
import { hasArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

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

  const { loading, progress, error, downloaded, download, cancel } =
    useArtifactDownload({ vaultId, primeContext });

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

  const handleDownload = () => {
    download(providerAddress, peginTxid, depositorPk);
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-4">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-[47px] shrink-0 items-center justify-center rounded-lg bg-secondary-main text-white">
          <IoDocumentText size={24} />
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
              {COPY.deposit.recoveryArtifacts.cardSize}
            </span>
          </div>
        </div>
      </div>

      {isDownloaded ? (
        <div className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-success-main/40 bg-success-main/10 px-4 text-success-main">
          <IoCheckmarkCircle size={16} />
          <span className="text-sm leading-[1.43] tracking-[0.17px]">
            {COPY.deposit.recoveryArtifacts.downloadedLabel}
          </span>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-stretch gap-2">
          <div className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-secondary-strokeLight bg-neutral-200 px-4 text-accent-primary">
            <Loader size={16} />
            <span className="text-sm leading-[1.43] tracking-[0.17px]">
              {COPY.deposit.recoveryArtifacts.downloadingButton}
            </span>
          </div>
          {progress && (
            <span className="text-center text-xs text-accent-secondary">
              {progress}
            </span>
          )}
          <button
            type="button"
            onClick={cancel}
            className="text-center text-xs text-accent-secondary underline hover:text-accent-primary"
          >
            {COPY.deposit.recoveryArtifacts.cancelDownloadButton}
          </button>
        </div>
      ) : (
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
