/**
 * MultiVaultDepositSignContent
 *
 * Renders the signing modal content for multi-vault (2-vault) deposits.
 * Uses useMultiVaultDepositFlow with a precomputed allocation plan
 * and passes variant="multi" to DepositProgressView for strategy-aware steps.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useCallback } from "react";
import type { Address } from "viem";

import { ArtifactDownloadModal } from "@/components/deposit/ArtifactDownloadModal";
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
  btcWalletProvider: BitcoinWallet | null;
  depositorEthAddress: Address | undefined;
  selectedApplication: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  getMnemonic: () => Promise<string>;
  mnemonicId?: string;
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
    payoutSigningProgress,
    artifactDownloadInfo,
    continueAfterArtifactDownload,
  } = useMultiVaultDepositFlow({
    vaultAmounts,
    precomputedPlan,
    ...flowParams,
  });

  // Auto-start the flow on mount
  const startFlow = useCallback(async () => {
    const result = await executeMultiVaultDeposit();
    if (result) {
      onRefetchActivities?.();
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
  }, [executeMultiVaultDeposit, onRefetchActivities, onSuccess]);

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
    <>
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
        payoutSigningProgress={payoutSigningProgress}
        onClose={handleClose}
        successMessage={DEPOSIT_SUCCESS_MESSAGE}
      />
      {artifactDownloadInfo && (
        <ArtifactDownloadModal
          open={!!artifactDownloadInfo}
          onClose={handleClose}
          onComplete={continueAfterArtifactDownload}
          providerUrl={artifactDownloadInfo.providerUrl}
          peginTxid={artifactDownloadInfo.peginTxid}
          depositorPk={artifactDownloadInfo.depositorPk}
        />
      )}
    </>
  );
}
