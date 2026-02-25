/**
 * Deposit modal flow component
 *
 * Renders the deposit modals (Review, Mnemonic, Sign, Success) based on the current step.
 */

import type { Address } from "viem";

import { DepositStep } from "../../../context/deposit/DepositState";
import { CollateralDepositReviewModal } from "../../deposit/DepositReviewModal";
import { CollateralDepositSignModal } from "../../deposit/DepositSignModal";
import { CollateralDepositSuccessModal } from "../../deposit/DepositSuccessModal";
import { MnemonicModal } from "../../deposit/MnemonicModal";

interface DepositModalsProps {
  depositStep: DepositStep | undefined;
  depositAmount: bigint;
  selectedApplication: string;
  selectedProviders: string[];
  feeRate: number;
  btcWalletProvider: unknown;
  ethAddress: Address | undefined;
  selectedProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  hasExistingVaults: boolean;
  onClose: () => void;
  onConfirmReview: (feeRate: number) => void;
  onConfirmMnemonic: () => void;
  onSignSuccess: (btcTxid: string, ethTxHash: string) => void;
  onRefetchActivities: () => Promise<void>;
}

export function DepositModals({
  depositStep,
  depositAmount,
  selectedApplication,
  selectedProviders,
  feeRate,
  btcWalletProvider,
  ethAddress,
  selectedProviderBtcPubkey,
  vaultKeeperBtcPubkeys,
  universalChallengerBtcPubkeys,
  hasExistingVaults,
  onClose,
  onConfirmReview,
  onConfirmMnemonic,
  onSignSuccess,
  onRefetchActivities,
}: DepositModalsProps) {
  return (
    <>
      {depositStep === DepositStep.REVIEW && (
        <CollateralDepositReviewModal
          open
          onClose={onClose}
          onConfirm={onConfirmReview}
          amount={depositAmount}
          providers={selectedProviders}
        />
      )}
      {depositStep === DepositStep.MNEMONIC && (
        <MnemonicModal
          open
          onClose={onClose}
          onComplete={onConfirmMnemonic}
          hasExistingVaults={hasExistingVaults}
        />
      )}
      {depositStep === DepositStep.SIGN && (
        <CollateralDepositSignModal
          open
          onClose={onClose}
          onSuccess={(btcTxid, ethTxHash) => onSignSuccess(btcTxid, ethTxHash)}
          amount={depositAmount}
          feeRate={feeRate}
          btcWalletProvider={btcWalletProvider}
          depositorEthAddress={ethAddress}
          selectedApplication={selectedApplication}
          selectedProviders={selectedProviders}
          vaultProviderBtcPubkey={selectedProviderBtcPubkey}
          vaultKeeperBtcPubkeys={vaultKeeperBtcPubkeys}
          universalChallengerBtcPubkeys={universalChallengerBtcPubkeys}
          onRefetchActivities={onRefetchActivities}
        />
      )}
      {depositStep === DepositStep.SUCCESS && (
        <CollateralDepositSuccessModal
          open
          onClose={onClose}
          amount={depositAmount}
        />
      )}
    </>
  );
}
