/**
 * PendingDepositModals Component
 *
 * Renders the sign / broadcast / success modals used by the pending deposit
 * section. Uses SimpleDeposit in resume mode for both sign and broadcast actions.
 */

import type { Hex } from "viem";

import { BroadcastSuccessModal } from "@/components/deposit/BroadcastSuccessModal";
import type { VaultActivity } from "@/types/activity";

import SimpleDeposit from "./SimpleDeposit";

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
      {/* Payout Sign Modal – full-screen with stepper */}
      {signModal.isOpen && signModal.signingTransactions && btcPublicKey && (
        <SimpleDeposit
          open={signModal.isOpen}
          resumeMode="sign_payouts"
          onClose={signModal.handleClose}
          onResumeSuccess={signModal.handleSuccess}
          activity={signModal.signingActivity!}
          transactions={signModal.signingTransactions as any[]}
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

      {/* Broadcast Success Modal */}
      <BroadcastSuccessModal
        open={broadcastModal.successOpen}
        onClose={broadcastModal.handleSuccessClose}
        amount={broadcastModal.successAmount}
      />
    </>
  );
}
