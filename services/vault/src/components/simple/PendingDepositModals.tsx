/**
 * PendingDepositModals Component
 *
 * Renders the sign / broadcast / success modals used by the pending deposit
 * section.  Kept as a separate component so the card list and modals are
 * independently testable and the section orchestrator stays thin.
 *
 * PayoutSignModal requires ProtocolParamsProvider (via usePayoutSigningState),
 * so we wrap it lazily – the provider only mounts when the modal opens.
 */

import type { Hex } from "viem";

import { BroadcastSignModal } from "@/components/deposit/BroadcastSignModal";
import { BroadcastSuccessModal } from "@/components/deposit/BroadcastSuccessModal";
import { PayoutSignModal } from "@/components/deposit/PayoutSignModal";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import type { VaultActivity } from "@/types/activity";

interface SignModalState {
  isOpen: boolean;
  signingActivity: VaultActivity | null;
  signingTransactions: unknown[] | null;
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

interface PendingDepositModalsProps {
  signModal: SignModalState;
  broadcastModal: BroadcastModalState;
  btcPublicKey: string | undefined;
  ethAddress: string | undefined;
}

export function PendingDepositModals({
  signModal,
  broadcastModal,
  btcPublicKey,
  ethAddress,
}: PendingDepositModalsProps) {
  return (
    <>
      {/* Payout Sign Modal – lazily wrapped in ProtocolParamsProvider */}
      {signModal.isOpen && signModal.signingTransactions && btcPublicKey && (
        <ProtocolParamsProvider>
          <PayoutSignModal
            open={signModal.isOpen}
            onClose={signModal.handleClose}
            activity={signModal.signingActivity!}
            transactions={signModal.signingTransactions}
            btcPublicKey={btcPublicKey}
            depositorEthAddress={ethAddress as Hex}
            onSuccess={signModal.handleSuccess}
          />
        </ProtocolParamsProvider>
      )}

      {/* Broadcast Sign Modal – also needs ProtocolParamsProvider (via useVaultActions → useSignPeginTransactions) */}
      {broadcastModal.broadcastingActivity && ethAddress && (
        <ProtocolParamsProvider>
          <BroadcastSignModal
            open={!!broadcastModal.broadcastingActivity}
            onClose={broadcastModal.handleClose}
            activity={broadcastModal.broadcastingActivity}
            depositorEthAddress={ethAddress}
            onSuccess={broadcastModal.handleSuccess}
          />
        </ProtocolParamsProvider>
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
