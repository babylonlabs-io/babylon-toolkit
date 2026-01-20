import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";
import { useCallback } from "react";
import type { Address } from "viem";

import { useDepositFlow } from "@/hooks/deposit/useDepositFlow";
import { useOnModalOpen } from "@/hooks/useOnModalOpen";

import { canCloseModal, DepositStep, getStepDescription } from "./constants";
import { DepositSteps } from "./DepositSteps";
import { StatusBanner } from "./StatusBanner";
import { StepProgress } from "./StepProgress";

interface CollateralDepositSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (
    btcTxid: string,
    ethTxHash: string,
    depositorBtcPubkey: string,
  ) => void;
  amount: bigint;
  feeRate: number;
  btcWalletProvider: any; // TODO: Type this properly with IBTCProvider
  depositorEthAddress: Address | undefined;
  selectedApplication: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  onRefetchActivities?: () => Promise<void>;
}

export function CollateralDepositSignModal({
  open,
  onClose,
  onSuccess,
  amount,
  feeRate,
  btcWalletProvider,
  depositorEthAddress,
  selectedApplication,
  selectedProviders,
  vaultProviderBtcPubkey,
  vaultKeeperBtcPubkeys,
  universalChallengerBtcPubkeys,
  onRefetchActivities,
}: CollateralDepositSignModalProps) {
  const {
    executeDepositFlow,
    currentStep,
    processing,
    error,
    isWaiting,
    payoutSigningProgress,
  } = useDepositFlow({
    amount,
    feeRate,
    btcWalletProvider,
    depositorEthAddress,
    selectedApplication,
    selectedProviders,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
  });

  // Execute flow and handle success
  const handleExecuteFlow = useCallback(async () => {
    const result = await executeDepositFlow();
    if (result) {
      onRefetchActivities?.();
      onSuccess(result.btcTxid, result.ethTxHash, result.depositorBtcPubkey);
    }
  }, [executeDepositFlow, onRefetchActivities, onSuccess]);

  // Execute flow once when modal opens
  useOnModalOpen(open, handleExecuteFlow);

  const isComplete = currentStep === DepositStep.COMPLETED;
  const canClose = canCloseModal(currentStep, error);
  const isProcessing = (processing || isWaiting) && !error && !isComplete;

  return (
    <ResponsiveDialog open={open} onClose={canClose ? onClose : undefined}>
      <DialogHeader
        title="Deposit in Progress"
        onClose={canClose ? onClose : undefined}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        <Text
          variant="body2"
          className="text-sm text-accent-secondary sm:text-base"
        >
          {getStepDescription(currentStep, isWaiting, payoutSigningProgress)}
        </Text>

        <DepositSteps currentStep={currentStep} />

        <StepProgress
          currentStep={currentStep}
          isWaiting={isWaiting}
          payoutSigningProgress={payoutSigningProgress}
        />

        {error && <StatusBanner variant="error">{error}</StatusBanner>}

        {isComplete && (
          <StatusBanner variant="success">
            Your Bitcoin transaction has been broadcast to the network. It will
            be confirmed after receiving the required number of Bitcoin
            confirmations.
          </StatusBanner>
        )}
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button
          disabled={isProcessing}
          variant="contained"
          className="w-full text-xs sm:text-base"
          onClick={canClose ? onClose : undefined}
        >
          {isProcessing ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : error ? (
            "Close"
          ) : isComplete ? (
            "Done"
          ) : (
            "Processing..."
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
