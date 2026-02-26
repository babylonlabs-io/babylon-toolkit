import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useCallback, useEffect, useRef } from "react";
import type { Address } from "viem";

import { computeDepositDerivedState } from "@/components/deposit/DepositSignModal/constants";
import { useDepositFlow } from "@/hooks/deposit/useDepositFlow";

import { DepositProgressView } from "./DepositProgressView";

interface DepositSignContentProps {
  amount: bigint;
  feeRate: number;
  btcWalletProvider: BitcoinWallet;
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
  const { isComplete, canClose, isProcessing, canContinueInBackground } =
    computeDepositDerivedState(currentStep, processing, isWaiting, error);

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
    />
  );
}
