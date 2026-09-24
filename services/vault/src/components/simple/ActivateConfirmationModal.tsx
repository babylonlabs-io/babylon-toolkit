import {
  Button,
  Checkbox,
  DialogBody,
  DialogFooter,
  ResponsiveDialog,
  WINDOW_BREAKPOINT,
  useIsMobile,
} from "@babylonlabs-io/core-ui";
import { useEffect, useRef, useState } from "react";
import { IoClose } from "react-icons/io5";
import { twJoin } from "tailwind-merge";
import type { Hex } from "viem";

import { ArtifactModalIcon } from "@/components/deposit/ArtifactModalIcon";
import {
  RecoveryArtifactsCard,
  type RecoveryArtifactsCardHandle,
} from "@/components/deposit/RecoveryArtifactsCard";
import { isActivationBlocked } from "@/components/shared/protocolStatus";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import { hasArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

interface ActivateConfirmationModalProps {
  open: boolean;
  vaultId: Hex;
  /**
   * Artifact-download inputs. All three are required for the recovery card
   * to attempt a download; if any are missing the card is hidden and the
   * user can only proceed by acknowledging the risk and activating without
   * artifacts.
   */
  providerAddress?: string;
  peginTxid?: string;
  depositorPk?: string;
  unsignedPrePeginTxHex?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function ActivateConfirmationModal({
  open,
  vaultId,
  providerAddress,
  peginTxid,
  depositorPk,
  unsignedPrePeginTxHex,
  onClose,
  onConfirm,
}: ActivateConfirmationModalProps) {
  // Bound to the pegin, so a receipt stored for a different one does not
  // satisfy the gate. When `peginTxid` is absent we cannot prove the stored
  // receipt belongs to this deposit, so this reads as not-downloaded and the
  // risk acknowledgement stays required — the same condition under which
  // `canRenderCard` below is false, so the two states agree.
  const [downloaded, setDownloaded] = useState(() =>
    hasArtifactsDownloaded(vaultId, peginTxid ?? ""),
  );
  const [acknowledged, setAcknowledged] = useState(false);
  // Mirrors RecoveryArtifactsCard's internal `loading` flag via
  // onLoadingChange so the footer Cancel button can switch to an in-place
  // "Cancel download" action while a download is in flight.
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDownloaded(hasArtifactsDownloaded(vaultId, peginTxid ?? ""));
    setAcknowledged(false);
    setIsDownloading(false);
  }, [open, vaultId, peginTxid]);

  const cardRef = useRef<RecoveryArtifactsCardHandle>(null);

  // Cancel any in-flight artifact download so closing the modal mid-download
  // doesn't leave the oversized RPC request running in the background.
  const handleClose = () => {
    cardRef.current?.cancel();
    onClose();
  };

  // While a download is in flight the footer button only cancels the
  // download and keeps the modal open (in-place cancel-and-retry): the
  // hook's cancel() resets its state, which flips `isDownloading` back via
  // onLoadingChange and restores the card's Download button. Dismissal
  // paths (Escape / backdrop) still go through handleClose.
  const handleCancelDownload = () => {
    cardRef.current?.cancel();
  };

  // The mobile sheet draws its own close button, so the design's header
  // control is desktop-only. Same breakpoint ResponsiveDialog switches on, so
  // exactly one of the two renders at every width.
  const isMobile = useIsMobile(WINDOW_BREAKPOINT);

  const canRenderCard = Boolean(providerAddress && peginTxid && depositorPk);
  const gate = useProtocolGateState();
  // Blocked while a download streams: confirming unmounts this modal and
  // would abandon the in-flight transfer uncancelled.
  const canActivate =
    (downloaded || acknowledged) &&
    !isDownloading &&
    !isActivationBlocked(gate);

  return (
    <ResponsiveDialog
      open={open}
      onClose={handleClose}
      className="w-[600px] max-w-full"
      dialogClassName="!rounded-2xl !bg-background-contrast"
    >
      {/* The design's close control. Hand-rolled so it carries an accessible
          name and no empty heading; core-ui's DialogHeader renders both.
          Desktop only: the mobile sheet draws its own close button. */}
      {!isMobile && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            aria-label={COPY.common.close}
            className="flex size-10 items-center justify-center text-accent-primary"
            data-testid="activate-modal-close"
          >
            <IoClose size={24} />
          </button>
        </div>
      )}
      {/* The mobile sheet's own inset is 16px; the desktop card's is 24px from
          `.bbn-dialog`. Below the breakpoint the previous padding is kept so
          the sheet keeps its 40px sides. */}
      <DialogBody
        className={twJoin(
          "flex flex-col items-stretch gap-8 text-accent-primary",
          isMobile && "px-6 pb-2 pt-10",
        )}
      >
        <div className="flex flex-col items-center gap-6">
          {downloaded ? (
            <ArtifactModalIcon variant="downloaded" />
          ) : (
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
                d="M11.25 15.4793L45.0161 5.625L78.75 15.4793V35.6882C78.75 56.9291 65.1566 75.7864 45.0049 82.5009C24.8477 75.7866 11.25 56.925 11.25 35.6788V15.4793Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          )}
          <div className="flex w-full flex-col items-center gap-6">
            <h2 className="text-center text-[34px] font-normal leading-[1.235] tracking-[0.25px] text-accent-primary">
              {downloaded
                ? COPY.deposit.activateConfirmation.titleDownloaded
                : COPY.deposit.activateConfirmation.title}
            </h2>
            <p className="text-center text-xl font-normal leading-[1.6] tracking-[0.15px] text-accent-secondary">
              {downloaded
                ? COPY.deposit.activateConfirmation.bodyDownloaded
                : COPY.deposit.activateConfirmation.body.map(
                    (segment, index) => (
                      <span
                        key={index}
                        className={
                          segment.emphasis ? "text-accent-primary" : undefined
                        }
                      >
                        {segment.text}
                      </span>
                    ),
                  )}
            </p>
          </div>
        </div>

        {canRenderCard && (
          <RecoveryArtifactsCard
            ref={cardRef}
            providerAddress={providerAddress as string}
            peginTxid={peginTxid as string}
            depositorPk={depositorPk as string}
            vaultId={vaultId}
            unsignedPrePeginTxHex={unsignedPrePeginTxHex}
            onDownloaded={() => setDownloaded(true)}
            onLoadingChange={setIsDownloading}
          />
        )}

        {!downloaded && (
          <label className="flex w-full cursor-pointer items-start gap-4">
            <Checkbox
              checked={acknowledged}
              onChange={() => setAcknowledged((v) => !v)}
              variant="default"
              showLabel={false}
            />
            <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
              {COPY.deposit.activateConfirmation.riskAcknowledgement}
            </span>
          </label>
        )}
      </DialogBody>

      {/* size="medium" gives the design's 14px label and 16px side padding;
          h-10 restores the design's 40px height over medium's default. */}
      <DialogFooter
        className={twJoin("flex flex-row gap-4 pt-4", isMobile && "px-6 pb-6")}
      >
        <Button
          variant="outlined"
          size="medium"
          className="h-10 flex-1 rounded-lg"
          onClick={isDownloading ? handleCancelDownload : handleClose}
        >
          {isDownloading
            ? COPY.deposit.activateConfirmation.cancelDownloadButton
            : COPY.deposit.activateConfirmation.cancelButton}
        </Button>
        <Button
          variant="contained"
          color="secondary"
          size="medium"
          className="h-10 flex-1 rounded-lg"
          onClick={onConfirm}
          disabled={!canActivate}
          data-testid="activate-vault-button"
        >
          {COPY.deposit.activateConfirmation.activateButton}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
