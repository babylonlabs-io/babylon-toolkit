/**
 * PendingDepositModals Component
 *
 * Renders the sign / broadcast / WOTS key / success modals used by the
 * pending deposit section. Uses SimpleDeposit in resume mode for all actions.
 */

import { useEffect, useState } from "react";
import type { Hex } from "viem";

import { ArtifactDownloadModal } from "@/components/deposit/ArtifactDownloadModal";
import { BroadcastSuccessModal } from "@/components/deposit/BroadcastSuccessModal";
import { RefundModal } from "@/components/deposit/RefundModal";
import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import type { SignModalData } from "@/hooks/deposit/usePayoutSignModal";
import type { VaultActivity } from "@/types/activity";
import type { VaultProvider } from "@/types/vaultProvider";

import { ActivateConfirmationModal } from "./ActivateConfirmationModal";
import SimpleDeposit from "./SimpleDeposit";

interface SignModalState {
  signingData: SignModalData | null;
  handleClose: () => void;
  handleSuccess: () => void;
}

interface BroadcastModalState {
  broadcastingActivity: VaultActivity | null;
  handleClose: () => void;
  handleSuccess: () => void;
  successOpen: boolean;
  successAmount: string;
  handleSuccessClose: () => void;
}

interface WotsKeyModalState {
  isOpen: boolean;
  activity: VaultActivity | null;
  handleClose: () => void;
  handleSuccess: () => void;
}

interface ActivationModalState {
  activatingActivity: VaultActivity | null;
  handleClose: () => void;
  handleSuccess: () => void;
}

interface RefundModalState {
  refundingActivity: VaultActivity | null;
  handleClose: () => void;
  handleSuccess: () => void;
}

interface PendingDepositModalsProps {
  signModal: SignModalState;
  broadcastModal: BroadcastModalState;
  wotsKeyModal: WotsKeyModalState;
  activationModal: ActivationModalState;
  refundModal: RefundModalState;
  vaultProviders: VaultProvider[];
  btcPublicKey: string | undefined;
  ethAddress: string | undefined;
}

export function PendingDepositModals({
  signModal,
  broadcastModal,
  wotsKeyModal,
  activationModal,
  refundModal,
  vaultProviders,
  btcPublicKey,
  ethAddress,
}: PendingDepositModalsProps) {
  const { refetch: refetchPolling } = usePeginPolling();

  const handleWotsKeySuccess = () => {
    wotsKeyModal.handleSuccess();
    refetchPolling();
  };

  const activatingActivity = activationModal.activatingActivity;
  const [activationConfirmed, setActivationConfirmed] = useState(false);
  const [showArtifactDownload, setShowArtifactDownload] = useState(false);
  const [downloadCompletedAt, setDownloadCompletedAt] = useState(0);

  useEffect(() => {
    if (!activatingActivity) {
      setActivationConfirmed(false);
      setShowArtifactDownload(false);
    }
  }, [activatingActivity]);

  const artifactProviderAddress = activatingActivity?.providers?.[0]?.id;
  const artifactPeginTxid = activatingActivity?.peginTxHash;
  const artifactDepositorPk = activatingActivity?.depositorBtcPubkey;
  const canDownloadArtifacts =
    !!activatingActivity &&
    !!artifactProviderAddress &&
    !!artifactPeginTxid &&
    !!artifactDepositorPk;

  return (
    <>
      {/* Payout Sign Modal – full-screen with stepper */}
      {signModal.signingData && btcPublicKey && (
        <SimpleDeposit
          open
          resumeMode="sign_payouts"
          onClose={signModal.handleClose}
          onResumeSuccess={signModal.handleSuccess}
          activity={signModal.signingData.activity}
          btcPublicKey={btcPublicKey}
          depositorEthAddress={ethAddress as Hex}
        />
      )}

      {/* Broadcast Modal – full-screen with stepper */}
      {broadcastModal.broadcastingActivity && ethAddress && (
        <SimpleDeposit
          open={!!broadcastModal.broadcastingActivity}
          resumeMode="broadcast_btc"
          onClose={broadcastModal.handleClose}
          onResumeSuccess={broadcastModal.handleSuccess}
          activity={broadcastModal.broadcastingActivity}
          depositorEthAddress={ethAddress}
        />
      )}

      {/* WOTS Key Modal – re-derives via wallet deriveContextHash */}
      {wotsKeyModal.isOpen && wotsKeyModal.activity && (
        <SimpleDeposit
          open={wotsKeyModal.isOpen}
          resumeMode="submit_wots_key"
          onClose={wotsKeyModal.handleClose}
          onResumeSuccess={handleWotsKeySuccess}
          activity={wotsKeyModal.activity}
          vaultProviders={vaultProviders}
        />
      )}

      {/* Activation gate — confirmation + artifact-download nudge */}
      {activatingActivity && ethAddress && !activationConfirmed && (
        <ActivateConfirmationModal
          open
          vaultId={activatingActivity.id}
          downloadCompletedAt={downloadCompletedAt}
          onClose={activationModal.handleClose}
          onConfirm={() => setActivationConfirmed(true)}
          onDownloadArtifacts={() => {
            if (canDownloadArtifacts) setShowArtifactDownload(true);
          }}
        />
      )}

      {activatingActivity && showArtifactDownload && canDownloadArtifacts && (
        <ArtifactDownloadModal
          open
          providerAddress={artifactProviderAddress as string}
          peginTxid={artifactPeginTxid as string}
          depositorPk={artifactDepositorPk as string}
          vaultId={activatingActivity.id}
          onClose={() => setShowArtifactDownload(false)}
          onComplete={() => {
            setShowArtifactDownload(false);
            setDownloadCompletedAt((n) => n + 1);
          }}
        />
      )}

      {/* Activation Modal — secret input + ETH tx */}
      {activatingActivity && ethAddress && activationConfirmed && (
        <SimpleDeposit
          open
          resumeMode="activate_vault"
          onClose={activationModal.handleClose}
          onResumeSuccess={activationModal.handleSuccess}
          activity={activatingActivity}
          depositorEthAddress={ethAddress}
        />
      )}

      {/* Refund Modal */}
      {refundModal.refundingActivity && (
        <RefundModal
          open={!!refundModal.refundingActivity}
          activity={refundModal.refundingActivity}
          onClose={refundModal.handleClose}
          onSuccess={refundModal.handleSuccess}
        />
      )}

      {/* Broadcast Success Modal */}
      <BroadcastSuccessModal
        open={broadcastModal.successOpen}
        onClose={broadcastModal.handleSuccessClose}
        amount={broadcastModal.successAmount}
      />
    </>
  );
}
