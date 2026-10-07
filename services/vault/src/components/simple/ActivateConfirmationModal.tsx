import {
  Button,
  Checkbox,
  DialogBody,
  DialogFooter,
  ResponsiveDialog,
  useIsMobile,
} from "@babylonlabs-io/core-ui";
import { useEffect, useRef, useState } from "react";
import { IoClose } from "react-icons/io5";
import { twJoin } from "tailwind-merge";
import type { Hex } from "viem";

import { ArtifactDownloadContent } from "@/components/deposit/ArtifactDownloadContent";
import { ArtifactModalIcon } from "@/components/deposit/ArtifactModalIcon";
import {
  RecoveryArtifactsCard,
  type ArtifactDownloadProgress,
  type RecoveryArtifactsCardHandle,
} from "@/components/deposit/RecoveryArtifactsCard";
import { isActivationBlocked } from "@/components/shared/protocolStatus";
import { COPY } from "@/copy";
import { useVpLiveness } from "@/hooks/deposit/useVpLiveness";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import {
  hasArtifactsDownloaded,
  hasGraphMismatch,
} from "@/utils/artifactDownloadStorage";
import { ETH_ADDRESS_PATTERN } from "@/utils/validation";

const IDLE_DOWNLOAD_STATE: ArtifactDownloadProgress = {
  loading: false,
  receivedBytes: 0,
  totalBytes: 0,
  status: "",
  error: null,
};

interface ActivateConfirmationModalProps {
  open: boolean;
  vaultId: Hex;
  /**
   * Artifact-download inputs. All three are required for the recovery card
   * to attempt a download; if any are missing, or the provider address is
   * not one a proxy URL can be built from, the modal shows "Deposit details
   * incomplete" and offers only Cancel (decision D3 in the activation VP
   * liveness gate spec): a deposit the app cannot check or download for is
   * not activated from here.
   */
  providerAddress?: string;
  peginTxid?: string;
  depositorPk?: string;
  unsignedPrePeginTxHex?: string;
  /**
   * God-mode demo vaults carry a synthetic provider that no probe can
   * confirm; the dev-only demo path sets this so the modal takes a
   * "reachable" verdict without a network call. Never set for real deposits.
   */
  simulateProviderLiveness?: boolean;
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
  simulateProviderLiveness = false,
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
  // A download found that the provider served a graph other than the one
  // signed at presign. Unlike missing artifacts, this is evidence against
  // activating, so the risk opt-out is withdrawn. Read from storage, so a
  // reopened modal keeps it; only a later matching download clears it.
  const [graphMismatch, setGraphMismatch] = useState(() =>
    hasGraphMismatch(vaultId, peginTxid ?? ""),
  );
  const [step, setStep] = useState<"download" | "confirmSkip">("download");
  // Mirrors RecoveryArtifactsCard's download state via onStateChange: the
  // card renders nothing while bytes stream, and this dialog presents the
  // download in its place.
  const [downloadState, setDownloadState] =
    useState<ArtifactDownloadProgress>(IDLE_DOWNLOAD_STATE);
  const isDownloading = downloadState.loading;

  useEffect(() => {
    if (!open) return;
    setDownloaded(hasArtifactsDownloaded(vaultId, peginTxid ?? ""));
    setAcknowledged(false);
    setGraphMismatch(hasGraphMismatch(vaultId, peginTxid ?? ""));
    setStep("download");
    setDownloadState(IDLE_DOWNLOAD_STATE);
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
  // onStateChange and restores the download step. Dismissal
  // paths (Escape / backdrop) still go through handleClose.
  const handleCancelDownload = () => {
    cardRef.current?.cancel();
  };

  // The mobile sheet draws its own close button, so the design's header
  // control is desktop-only. Same breakpoint ResponsiveDialog switches on, so
  // exactly one of the two renders at every width.
  const isMobile = useIsMobile();

  // A malformed address is a data problem too: no proxy URL can be built
  // from it, so neither the probe nor the download could ever run.
  const canRenderCard = Boolean(
    providerAddress &&
      ETH_ADDRESS_PATTERN.test(providerAddress) &&
      peginTxid &&
      depositorPk,
  );
  // A deposit the app cannot check or download for must not be activated
  // (decision D3); the indexer record is what is incomplete, not the vault.
  const dataIncomplete = !canRenderCard;
  const gate = useProtocolGateState();
  const activationBlocked = isActivationBlocked(gate);

  // Activation is irreversible, so the modal asks the provider one question
  // before offering anything (pegin.md: read the status before revealing s).
  // An incomplete deposit is blocked without asking.
  const liveness = useVpLiveness(
    providerAddress,
    vaultId,
    open && !simulateProviderLiveness && canRenderCard,
  );
  const livenessStatus = simulateProviderLiveness
    ? "reachable"
    : liveness.status;
  const vpReachable = livenessStatus === "reachable";
  const vpUnconfirmed = livenessStatus === "vp-unconfirmed";
  const proxyUnreachable = livenessStatus === "proxy-unreachable";
  // `idle` and `probing` both mean "no verdict yet"; nothing opens on either.
  const probeSettled = vpReachable || vpUnconfirmed || proxyUnreachable;

  // A failed download may mean the provider went away mid-transfer, so the
  // provider is asked again.
  const downloadError = downloadState.error;
  const { retry: retryProbe } = liveness;
  useEffect(() => {
    if (downloadError !== null) retryProbe();
  }, [downloadError, retryProbe]);

  const isConfirmSkip =
    !downloaded &&
    step === "confirmSkip" &&
    !graphMismatch &&
    vpReachable &&
    !dataIncomplete;

  // Losing confirmation, or the deposit's details, while on the confirm-skip
  // step sends the user back: the acknowledgement was given against a
  // provider that answered for a deposit the app could check.
  useEffect(() => {
    if (step === "confirmSkip" && (!vpReachable || dataIncomplete)) {
      setStep("download");
      setAcknowledged(false);
    }
  }, [step, vpReachable, dataIncomplete]);

  const blockedByProbe = vpUnconfirmed || proxyUnreachable;

  // With artifacts saved, a graph mismatch or a protocol pause already
  // withholds Activate, so the saved-artifacts warning (and its Check again)
  // must not say the user can still activate. The card stays visible: it
  // carries the mismatch reason; a pause is announced by the page banner.
  const activateWithheld = graphMismatch || activationBlocked;
  const showUnconfirmedDownloadedWarning =
    downloaded && vpUnconfirmed && !activateWithheld;

  // The card unmounts with its inputs; drop the mirrored download state so the
  // footer does not offer a cancel that would reach a null ref.
  useEffect(() => {
    if (dataIncomplete) setDownloadState(IDLE_DOWNLOAD_STATE);
  }, [dataIncomplete]);

  // Download may start before the verdict; a verdict that blocks ends it.
  const downloadInFlight = downloadState.loading;
  useEffect(() => {
    if (blockedByProbe && downloadInFlight) cardRef.current?.cancel();
  }, [blockedByProbe, downloadInFlight]);

  const handleBackToDownload = () => {
    setAcknowledged(false);
    setStep("download");
  };

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
        {isDownloading && !dataIncomplete ? (
          <ArtifactDownloadContent
            receivedBytes={downloadState.receivedBytes}
            totalBytes={downloadState.totalBytes}
            status={downloadState.status}
          />
        ) : (
          <div className="flex flex-col items-center gap-6">
            {downloaded && !dataIncomplete ? (
              <ArtifactModalIcon variant="downloaded" />
            ) : (
              !isConfirmSkip && (
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
              )
            )}
            <div className="flex w-full flex-col items-center gap-6">
              <h2 className="text-center text-[34px] font-normal leading-[1.235] tracking-[0.25px] text-accent-primary">
                {dataIncomplete
                  ? COPY.deposit.activateConfirmation.dataIncompleteTitle
                  : downloaded
                    ? COPY.deposit.activateConfirmation.titleDownloaded
                    : isConfirmSkip
                      ? COPY.deposit.activateConfirmation.confirmSkipTitle
                      : vpUnconfirmed
                        ? COPY.deposit.activateConfirmation.vpUnconfirmedTitle
                        : proxyUnreachable
                          ? COPY.deposit.activateConfirmation
                              .proxyUnreachableTitle
                          : COPY.deposit.activateConfirmation.title}
              </h2>
              <p className="text-center text-xl font-normal leading-[1.6] tracking-[0.15px] text-accent-secondary">
                {dataIncomplete
                  ? COPY.deposit.activateConfirmation.dataIncompleteBody
                  : downloaded
                    ? showUnconfirmedDownloadedWarning
                      ? COPY.deposit.activateConfirmation
                          .vpUnconfirmedBodyDownloaded
                      : COPY.deposit.activateConfirmation.bodyDownloaded
                    : isConfirmSkip
                      ? COPY.deposit.activateConfirmation.confirmSkipBody
                      : vpUnconfirmed
                        ? COPY.deposit.activateConfirmation.vpUnconfirmedBody
                        : proxyUnreachable
                          ? COPY.deposit.activateConfirmation
                              .proxyUnreachableBody
                          : COPY.deposit.activateConfirmation.body.map(
                              (segment, index) => (
                                <span
                                  key={index}
                                  className={
                                    segment.emphasis
                                      ? "text-accent-primary"
                                      : undefined
                                  }
                                >
                                  {segment.text}
                                </span>
                              ),
                            )}
              </p>
              {!dataIncomplete && !probeSettled && (
                <p className="text-center text-sm leading-[1.5] tracking-[0.15px] text-accent-secondary">
                  {COPY.deposit.activateConfirmation.probingVaultProvider}
                </p>
              )}
            </div>
          </div>
        )}

        {canRenderCard && (
          <div
            hidden={
              isConfirmSkip ||
              isDownloading ||
              showUnconfirmedDownloadedWarning ||
              (blockedByProbe && !downloaded)
            }
          >
            <RecoveryArtifactsCard
              ref={cardRef}
              providerAddress={providerAddress as string}
              peginTxid={peginTxid as string}
              depositorPk={depositorPk as string}
              vaultId={vaultId}
              unsignedPrePeginTxHex={unsignedPrePeginTxHex}
              onDownloaded={() => {
                // The receipt this download wrote cleared the stored mismatch.
                setDownloaded(true);
                setGraphMismatch(false);
              }}
              onStateChange={setDownloadState}
              onGraphMismatch={() => setGraphMismatch(true)}
            />
          </div>
        )}

        {isConfirmSkip && (
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
          h-10 restores the design's 40px height over medium's default. The
          downloading body spaces its blocks 40px apart, the activation body
          16px, and the footer belongs to whichever is showing. */}
      <DialogFooter
        className={twJoin(
          "flex flex-row gap-4",
          isDownloading ? "pt-10" : "pt-4",
          isMobile && "px-6 pb-6",
        )}
      >
        {dataIncomplete ? (
          <Button
            variant="outlined"
            size="medium"
            className="h-10 flex-1 rounded-lg"
            onClick={handleClose}
          >
            {COPY.deposit.activateConfirmation.cancelButton}
          </Button>
        ) : isDownloading ? (
          <Button
            variant="outlined"
            size="medium"
            className="h-10 flex-1 rounded-lg"
            onClick={handleCancelDownload}
          >
            {COPY.deposit.activateConfirmation.cancelDownloadButton}
          </Button>
        ) : downloaded ? (
          <>
            {showUnconfirmedDownloadedWarning ? (
              // data-testid is a real-wallet E2E hook (e2e/real/actions/stepMachine.ts) — carry it over if you move or rename the element.
              <Button
                variant="outlined"
                size="medium"
                className="h-10 flex-1 rounded-lg"
                onClick={liveness.retry}
                data-testid="retry-vp-probe-button"
              >
                {COPY.deposit.activateConfirmation.checkAgainButton}
              </Button>
            ) : (
              <Button
                variant="outlined"
                size="medium"
                className="h-10 flex-1 rounded-lg"
                onClick={handleClose}
              >
                {COPY.deposit.activateConfirmation.cancelButton}
              </Button>
            )}
            <Button
              variant="contained"
              color="secondary"
              size="medium"
              className="h-10 flex-1 rounded-lg"
              onClick={onConfirm}
              disabled={graphMismatch || activationBlocked || !probeSettled}
              data-testid="activate-vault-button"
            >
              {COPY.deposit.activateConfirmation.activateButton}
            </Button>
          </>
        ) : isConfirmSkip ? (
          <>
            <Button
              variant="outlined"
              size="medium"
              className="h-10 flex-1 rounded-lg"
              onClick={handleBackToDownload}
            >
              {COPY.deposit.activateConfirmation.cancelButton}
            </Button>
            <Button
              variant="contained"
              color="secondary"
              size="medium"
              className="h-10 flex-1 rounded-lg"
              onClick={onConfirm}
              disabled={!acknowledged || graphMismatch || activationBlocked}
              data-testid="activate-vault-button"
            >
              {COPY.deposit.activateConfirmation.activateButton}
            </Button>
          </>
        ) : blockedByProbe ? (
          <>
            <Button
              variant="outlined"
              size="medium"
              className="h-10 flex-1 rounded-lg"
              onClick={handleClose}
            >
              {COPY.deposit.activateConfirmation.cancelButton}
            </Button>
            {/* data-testid is a real-wallet E2E hook (e2e/real/actions/stepMachine.ts) — carry it over if you move or rename the element. */}
            <Button
              variant="contained"
              color="secondary"
              size="medium"
              className="h-10 flex-1 rounded-lg"
              onClick={liveness.retry}
              data-testid="retry-vp-probe-button"
            >
              {COPY.deposit.activateConfirmation.checkAgainButton}
            </Button>
          </>
        ) : (
          <>
            {!graphMismatch && vpReachable && (
              <Button
                variant="outlined"
                size="medium"
                className="h-10 flex-1 rounded-lg"
                onClick={() => setStep("confirmSkip")}
              >
                {COPY.deposit.activateConfirmation.continueWithoutButton}
              </Button>
            )}
            <Button
              variant="contained"
              color="secondary"
              size="medium"
              className="h-10 flex-1 rounded-lg"
              onClick={() => cardRef.current?.download()}
              data-testid="download-artifacts-button"
            >
              {COPY.deposit.activateConfirmation.downloadButton}
            </Button>
          </>
        )}
      </DialogFooter>
    </ResponsiveDialog>
  );
}
