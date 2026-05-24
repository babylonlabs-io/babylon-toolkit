import {
  Button,
  Checkbox,
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
  const [downloaded, setDownloaded] = useState(() =>
    hasArtifactsDownloaded(vaultId),
  );
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDownloaded(hasArtifactsDownloaded(vaultId));
    setAcknowledged(false);
  }, [open, vaultId]);

  const cardRef = useRef<RecoveryArtifactsCardHandle>(null);

  // Cancel any in-flight artifact download so closing the modal mid-download
  // doesn't leave the oversized RPC request running in the background.
  const handleClose = () => {
    cardRef.current?.cancel();
    onClose();
  };

  const canRenderCard = Boolean(providerAddress && peginTxid && depositorPk);
  const canActivate = downloaded || acknowledged;

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
        <div className="flex flex-col items-center gap-10">
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
          <div className="flex w-full flex-col items-center gap-4">
            <h2 className="text-center text-[34px] font-normal leading-[1.235] tracking-[0.25px] text-accent-primary">
              {COPY.deposit.activateConfirmation.title}
            </h2>
            <p className="text-center text-xl font-normal leading-[1.6] tracking-[0.15px] text-accent-secondary">
              {COPY.deposit.activateConfirmation.body}
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

      <DialogFooter className="flex flex-row gap-4 px-6 pb-6 pt-4">
        <Button
          variant="outlined"
          className="h-10 flex-1"
          onClick={handleClose}
        >
          {COPY.deposit.activateConfirmation.cancelButton}
        </Button>
        <Button
          variant="contained"
          color="secondary"
          className="h-10 flex-1"
          onClick={onConfirm}
          disabled={!canActivate}
        >
          {COPY.deposit.activateConfirmation.activateButton}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
