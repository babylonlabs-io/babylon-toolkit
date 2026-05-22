/**
 * PendingDepositModals Component
 *
 * Renders the sign / broadcast / WOTS key / success modals used by the
 * pending deposit section. Uses SimpleDeposit in resume mode for all actions.
 */

import type { Hex } from "viem";

import { BroadcastSuccessModal } from "@/components/deposit/BroadcastSuccessModal";
import { RefundModal } from "@/components/deposit/RefundModal";
import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import type { SignModalData } from "@/hooks/deposit/usePayoutSignModal";
import type { VaultActivity } from "@/types/activity";
import type { VaultProvider } from "@/types/vaultProvider";

import { ActivationGate } from "./ActivationGate";
import SimpleDeposit from "./SimpleDeposit";

interface SignModalState {
  signingData: SignModalData | null;
  handleClose: () => void;
  handleSuccess: () => void;
}

interface BroadcastModalState {
  broadcastingActivity: VaultActivity | null;
  /** All vault IDs sharing the Pre-PegIn being broadcast (batched pegin). */
  broadcastingBatchIds: string[];
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
          batchVaultIds={broadcastModal.broadcastingBatchIds}
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

      {/* Activation gate — confirmation + artifact-download nudge, then activate */}
      {activatingActivity && ethAddress && (
        <ActivationGate
          key={activatingActivity.id}
          activity={activatingActivity}
          onClose={activationModal.handleClose}
        >
          <SimpleDeposit
            open
            resumeMode="activate_vault"
            onClose={activationModal.handleClose}
            onResumeSuccess={activationModal.handleSuccess}
            activity={activatingActivity}
            depositorEthAddress={ethAddress}
          />
        </ActivationGate>
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
