import {
  Button,
  Checkbox,
  ConfirmationDialog,
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
  /** Missing or invalid download inputs block activation (decision D3). */
  providerAddress?: string;
  peginTxid?: string;
  depositorPk?: string;
  unsignedPrePeginTxHex?: string;
  /** Skip the provider probe for dev-only demo vaults. Never use for real deposits. */
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
  // A receipt must match this deposit. Missing inputs cannot prove a match.
  const [downloaded, setDownloaded] = useState(() =>
    hasArtifactsDownloaded(vaultId, peginTxid ?? ""),
  );
  const [acknowledged, setAcknowledged] = useState(false);
  // A stored graph mismatch blocks activation until a matching download clears it.
  const [graphMismatch, setGraphMismatch] = useState(() =>
    hasGraphMismatch(vaultId, peginTxid ?? ""),
  );
  const [step, setStep] = useState<"download" | "confirmSkip">("download");
  // Keep the card mounted while this dialog presents its download state.
  const [downloadState, setDownloadState] =
    useState<ArtifactDownloadProgress>(IDLE_DOWNLOAD_STATE);
  const isDownloading = downloadState.loading;
  const [cancelAction, setCancelAction] = useState<"close" | "cancel" | null>(
    null,
  );

  useEffect(() => {
    if (!isDownloading) setCancelAction(null);
  }, [isDownloading]);

  useEffect(() => {
    if (!open) return;
    setDownloaded(hasArtifactsDownloaded(vaultId, peginTxid ?? ""));
    setAcknowledged(false);
    setGraphMismatch(hasGraphMismatch(vaultId, peginTxid ?? ""));
    setStep("download");
    setDownloadState(IDLE_DOWNLOAD_STATE);
    setCancelAction(null);
  }, [open, vaultId, peginTxid]);

  const cardRef = useRef<RecoveryArtifactsCardHandle>(null);

  const handleClose = () => {
    if (isDownloading) setCancelAction("close");
    else onClose();
  };

  const confirmCancelDownload = () => {
    if (isDownloading) {
      cardRef.current?.cancel();
      if (cancelAction === "close") onClose();
    }
    setCancelAction(null);
  };

  // During download, use our Close button on both layouts to request confirmation.
  const isMobile = useIsMobile();

  // An invalid provider address blocks both the probe and the download.
  const canRenderCard = Boolean(
    providerAddress &&
      ETH_ADDRESS_PATTERN.test(providerAddress) &&
      peginTxid &&
      depositorPk,
  );
  // Incomplete deposit details block activation (decision D3).
  const dataIncomplete = !canRenderCard;
  const gate = useProtocolGateState();
  const activationBlocked = isActivationBlocked(gate);

  // Ask for provider status before revealing the secret (pegin.md).
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

  // Ask the provider again after a download fails.
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

  // Reset the acknowledgement if the provider or deposit details change.
  useEffect(() => {
    if (step === "confirmSkip" && (!vpReachable || dataIncomplete)) {
      setStep("download");
      setAcknowledged(false);
    }
  }, [step, vpReachable, dataIncomplete]);

  const blockedByProbe = vpUnconfirmed || proxyUnreachable;

  // Keep the card visible if a mismatch or pause blocks activation.
  const activateWithheld = graphMismatch || activationBlocked;
  const showUnconfirmedDownloadedWarning =
    downloaded && vpUnconfirmed && !activateWithheld;

  // Drop download state when missing inputs unmount the card.
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
      onClose={isDownloading ? undefined : handleClose}
      className="w-[600px] max-w-full"
      dialogClassName="!rounded-2xl !bg-background-contrast"
    >
      {(!isMobile || isDownloading) && (
        <div
          className={
            isMobile ? "absolute left-4 top-4 z-10" : "flex justify-end"
          }
        >
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
      {/* Keep 40px sides in the mobile sheet. */}
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
            onClick={() => setCancelAction("cancel")}
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
            {!graphMismatch && (
              <Button
                variant="outlined"
                size="medium"
                className="h-10 flex-1 rounded-lg"
                onClick={() => setStep("confirmSkip")}
                disabled={!vpReachable}
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
      <ConfirmationDialog
        open={open && isDownloading && cancelAction !== null}
        onClose={() => setCancelAction(null)}
        title={COPY.deposit.recoveryArtifacts.cancelConfirmation.title}
        description={COPY.deposit.recoveryArtifacts.cancelConfirmation.body}
        primaryAction={{
          label: COPY.deposit.recoveryArtifacts.cancelConfirmation.keepButton,
          onClick: () => setCancelAction(null),
        }}
        secondaryAction={{
          label: COPY.deposit.recoveryArtifacts.cancelConfirmation.cancelButton,
          onClick: confirmCancelDownload,
        }}
      />
    </ResponsiveDialog>
  );
}
