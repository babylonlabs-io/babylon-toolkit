/**
 * MultiVaultDepositSignContent
 *
 * Renders the signing modal content for multi-vault (2-vault) deposits.
 * Uses useMultiVaultDepositFlow with a precomputed allocation plan
 * and passes variant="multi" to DepositProgressView for strategy-aware steps.
 */

import { useCallback } from "react";
import type { Address } from "viem";

import {
  computeDepositDerivedState,
  DEPOSIT_SUCCESS_MESSAGE,
} from "@/components/deposit/DepositSignModal/depositStepHelpers";
import { useMultiVaultDepositFlow } from "@/hooks/deposit/useMultiVaultDepositFlow";
import { useRunOnce } from "@/hooks/useRunOnce";
import type { AllocationPlan } from "@/services/vault";

import { DepositProgressView } from "./DepositProgressView";

interface MultiVaultDepositSignContentProps {
  vaultAmounts: bigint[];
  precomputedPlan: AllocationPlan;
  feeRate: number;
  btcWalletProvider: any;
  depositorEthAddress: Address | undefined;
  selectedApplication: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  getMnemonic?: () => Promise<string>;
  onSuccess: (
    btcTxid: string,
    ethTxHash: string,
    depositorBtcPubkey: string,
  ) => void;
  onClose: () => void;
}

export function MultiVaultDepositSignContent({
  onClose,
  onSuccess,
  vaultAmounts,
  precomputedPlan,
  ...flowParams
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
    precomputedPlan,
    ...flowParams,
  });

  // Auto-start the flow on mount
  const startFlow = useCallback(async () => {
    const result = await executeMultiVaultDeposit();
    if (result) {
      // Use the first successful pegin for the success callback
      const firstSuccess = result.pegins.find((p) => !p.error);
      if (firstSuccess) {
        onSuccess(
          firstSuccess.btcTxHash,
          firstSuccess.ethTxHash,
          firstSuccess.depositorBtcPubkey,
        );
      }
    }
  }, [executeMultiVaultDeposit, onSuccess]);

  useRunOnce(startFlow);

  // Derived state
  const { isComplete, canClose, isProcessing, canContinueInBackground } =
    computeDepositDerivedState(currentStep, processing, isWaiting, error);

  const handleClose = useCallback(() => {
    abort();
    onClose();
  }, [abort, onClose]);

  const strategy = precomputedPlan.strategy as "MULTI_INPUT" | "SPLIT";

  return (
    <DepositProgressView
      variant="multi"
      strategy={strategy}
      currentVaultIndex={currentVaultIndex}
      currentStep={currentStep}
      isWaiting={isWaiting}
      error={error}
      isComplete={isComplete}
      isProcessing={isProcessing}
      canClose={canClose}
      canContinueInBackground={canContinueInBackground}
      payoutSigningProgress={null}
      onClose={handleClose}
      successMessage={DEPOSIT_SUCCESS_MESSAGE}
    />
  );
}
