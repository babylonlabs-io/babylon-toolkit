import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useCallback } from "react";
import type { Address } from "viem";

import { computeDepositDerivedState } from "@/components/deposit/DepositSignModal/constants";
import {
  useMultiVaultDepositFlow,
  type SplitTxSignResult,
} from "@/hooks/deposit/useMultiVaultDepositFlow";
import { useRunOnce } from "@/hooks/useRunOnce";
import type { AllocationPlan } from "@/services/vault";

import { DepositProgressView } from "./DepositProgressView";

interface MultiVaultDepositSignContentProps {
  vaultAmounts: bigint[];
  feeRate: number;
  btcWalletProvider: BitcoinWallet;
  depositorEthAddress: Address | undefined;
  selectedApplication: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  precomputedPlan: AllocationPlan;
  precomputedSplitTxResult: SplitTxSignResult | null;
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
}: MultiVaultDepositSignContentProps) {
  const {
    executeMultiVaultDeposit,
    abort,
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
  const handleStart = useCallback(async () => {
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
  }, [executeMultiVaultDeposit, onRefetchActivities, onSuccess]);

  useRunOnce(handleStart);

  const handleClose = useCallback(() => {
    abort();
    onClose();
  }, [abort, onClose]);

  // Derived state
  const { isComplete, canClose, isProcessing, canContinueInBackground } =
    computeDepositDerivedState(currentStep, processing, isWaiting, error);

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
    />
  );
}
