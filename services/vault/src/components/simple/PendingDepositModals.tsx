/**
 * PendingDepositModals Component
 *
 * Renders the sign / broadcast / lamport key / success modals used by the
 * pending deposit section. Uses SimpleDeposit in resume mode for all actions.
 */

import type { Hex } from "viem";

import { BroadcastSuccessModal } from "@/components/deposit/BroadcastSuccessModal";
import type { VaultActivity } from "@/types/activity";
import type { ClaimerTransactions } from "@/types/rpc";
import type { VaultProvider } from "@/types/vaultProvider";

import SimpleDeposit from "./SimpleDeposit";

interface SignModalState {
  isOpen: boolean;
  signingActivity: VaultActivity | null;
  signingTransactions: ClaimerTransactions[] | null;
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

interface LamportKeyModalState {
  isOpen: boolean;
  activity: VaultActivity | null;
  handleClose: () => void;
  handleSuccess: () => void;
}

interface PendingDepositModalsProps {
  signModal: SignModalState;
  broadcastModal: BroadcastModalState;
  lamportKeyModal: LamportKeyModalState;
  vaultProviders: VaultProvider[];
  btcPublicKey: string | undefined;
  ethAddress: string | undefined;
}

export function PendingDepositModals({
  signModal,
  broadcastModal,
  lamportKeyModal,
  vaultProviders,
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
          transactions={signModal.signingTransactions}
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

      {/* Lamport Key Modal – mnemonic re-entry */}
      {lamportKeyModal.isOpen && lamportKeyModal.activity && (
        <SimpleDeposit
          open={lamportKeyModal.isOpen}
          resumeMode="submit_lamport_key"
          onClose={lamportKeyModal.handleClose}
          onResumeSuccess={lamportKeyModal.handleSuccess}
          activity={lamportKeyModal.activity}
          vaultProviders={vaultProviders}
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
