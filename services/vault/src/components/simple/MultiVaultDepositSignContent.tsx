import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Address } from "viem";

import { canCloseMultiVaultModal } from "@/components/deposit/MultiVaultDepositSignModal/constants";
import { DepositStep } from "@/hooks/deposit/depositFlowSteps";
import {
  useMultiVaultDepositFlow,
  type SplitTxSignResult,
} from "@/hooks/deposit/useMultiVaultDepositFlow";
import type { AllocationPlan } from "@/services/vault";

import { DepositProgressView } from "./DepositProgressView";

interface MultiVaultDepositSignContentProps {
  amount: bigint;
  feeRate: number;
  btcWalletProvider: any;
  depositorEthAddress: Address | undefined;
  selectedApplication: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  precomputedPlan?: AllocationPlan;
  precomputedSplitTxResult?: SplitTxSignResult | null;
  onSuccess: (
    btcTxid: string,
    ethTxHash: string,
    depositorBtcPubkey: string,
  ) => void;
  onClose: () => void;
  onRefetchActivities?: () => Promise<void>;
}

export function MultiVaultDepositSignContent({
  onClose,
  onSuccess,
  onRefetchActivities,
  amount,
  feeRate,
  btcWalletProvider,
  depositorEthAddress,
  selectedApplication,
  selectedProviders,
  vaultProviderBtcPubkey,
  vaultKeeperBtcPubkeys,
  universalChallengerBtcPubkeys,
  precomputedPlan,
  precomputedSplitTxResult,
}: MultiVaultDepositSignContentProps) {
  // Split amount 50/50 (handles odd satoshi via integer division)
  const vaultAmounts = useMemo(
    () => [amount / 2n, amount - amount / 2n],
    [amount],
  );

  const {
    executeMultiVaultDeposit,
    currentStep,
    currentVaultIndex,
    processing,
    error,
    isWaiting,
  } = useMultiVaultDepositFlow({
    vaultAmounts,
    feeRate,
    btcWalletProvider,
    depositorEthAddress,
    selectedApplication,
    selectedProviders,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    precomputedPlan,
    precomputedSplitTxResult,
  });

  // Auto-start the flow on mount
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      const result = await executeMultiVaultDeposit();
      if (result) {
        onRefetchActivities?.();
        // Extract first successful pegin for page-level success callback
        const firstSuccess = result.pegins.find((p) => !p.error);
        if (firstSuccess) {
          onSuccess(
            firstSuccess.btcTxHash,
            firstSuccess.ethTxHash,
            firstSuccess.depositorBtcPubkey,
          );
        }
      }
    })();
  }, [executeMultiVaultDeposit, onRefetchActivities, onSuccess]);

  // Derived state
  const isComplete = currentStep === DepositStep.COMPLETED;
  const canClose = canCloseMultiVaultModal(currentStep, error, isWaiting);
  const isProcessing = (processing || isWaiting) && !error && !isComplete;
  const canContinueInBackground =
    isWaiting && currentStep >= DepositStep.SIGN_PAYOUTS && !error;

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <DepositProgressView
      variant="multi"
      currentStep={currentStep}
      currentVaultIndex={currentVaultIndex}
      error={error}
      isComplete={isComplete}
      isProcessing={isProcessing}
      canClose={canClose}
      canContinueInBackground={canContinueInBackground}
      onClose={handleClose}
      successMessage="Your Bitcoin transaction has been broadcast to the network. It will be confirmed after receiving the required number of Bitcoin confirmations."
    />
  );
}
