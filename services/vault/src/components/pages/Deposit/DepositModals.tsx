/**
 * Deposit modal flow component
 *
 * Renders the deposit modals (Review, Sign, Success) based on the current step.
 */

import type { Address } from "viem";

import { DepositStep } from "../../../context/deposit/DepositState";
import { CollateralDepositReviewModal } from "../../deposit/DepositReviewModal";
import { CollateralDepositSignModal } from "../../deposit/DepositSignModal";
import { CollateralDepositSuccessModal } from "../../deposit/DepositSuccessModal";

interface DepositModalsProps {
  depositStep: DepositStep | undefined;
  depositAmount: bigint;
  selectedApplication: string;
  selectedProviders: string[];
  feeRate: number;
  btcWalletProvider: unknown;
  ethAddress: Address | undefined;
  selectedProviderBtcPubkey: string;
  liquidatorBtcPubkeys: string[];
  onClose: () => void;
  onConfirmReview: (feeRate: number) => void;
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
  liquidatorBtcPubkeys,
  onClose,
  onConfirmReview,
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
          liquidatorBtcPubkeys={liquidatorBtcPubkeys}
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
