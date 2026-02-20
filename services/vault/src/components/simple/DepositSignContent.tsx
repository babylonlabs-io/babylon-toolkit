import { useCallback, useEffect, useRef } from "react";
import type { Address } from "viem";

import {
  canCloseModal,
  DepositStep,
} from "@/components/deposit/DepositSignModal/constants";
import { useDepositFlow } from "@/hooks/deposit/useDepositFlow";

import { DepositProgressView } from "./DepositProgressView";

interface DepositSignContentProps {
  amount: bigint;
  feeRate: number;
  btcWalletProvider: any;
  depositorEthAddress: Address | undefined;
  selectedApplication: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  onSuccess: (
    btcTxid: string,
    ethTxHash: string,
    depositorBtcPubkey: string,
  ) => void;
  onClose: () => void;
  onRefetchActivities?: () => Promise<void>;
}

export function DepositSignContent({
  onClose,
  onSuccess,
  onRefetchActivities,
  ...flowParams
}: DepositSignContentProps) {
  const {
    executeDepositFlow,
    abort,
    currentStep,
    processing,
    error,
    isWaiting,
    payoutSigningProgress,
  } = useDepositFlow(flowParams);

  // Auto-start the flow on mount
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      const result = await executeDepositFlow();
      if (result) {
        onRefetchActivities?.();
        onSuccess(result.btcTxid, result.ethTxHash, result.depositorBtcPubkey);
      }
    })();
  }, [executeDepositFlow, onRefetchActivities, onSuccess]);

  // Derived state
  const isComplete = currentStep === DepositStep.COMPLETED;
  const canClose = canCloseModal(currentStep, error, isWaiting);
  const isProcessing = (processing || isWaiting) && !error && !isComplete;
  const canContinueInBackground =
    isWaiting && currentStep >= DepositStep.SIGN_PAYOUTS && !error;

  const handleClose = useCallback(() => {
    abort();
    onClose();
  }, [abort, onClose]);

  return (
    <DepositProgressView
      currentStep={currentStep}
      isWaiting={isWaiting}
      error={error}
      isComplete={isComplete}
      isProcessing={isProcessing}
      canClose={canClose}
      canContinueInBackground={canContinueInBackground}
      payoutSigningProgress={payoutSigningProgress}
      onClose={handleClose}
      successMessage="Your Bitcoin transaction has been broadcast to the network. It will be confirmed after receiving the required number of Bitcoin confirmations."
    />
  );
}
