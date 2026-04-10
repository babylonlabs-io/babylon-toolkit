/**
 * DepositSignContent
 *
 * Renders the signing modal content for deposits (single or multi-vault).
 * Always uses array-based props — single vault is an array of 1.
 * Dynamically adjusts progress steps based on vault count.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useCallback } from "react";
import type { Address, Hex } from "viem";

import { ArtifactDownloadModal } from "@/components/deposit/ArtifactDownloadModal";
import {
  computeDepositDerivedState,
  DEPOSIT_SUCCESS_MESSAGE,
} from "@/components/deposit/DepositSignModal/depositStepHelpers";
import { useMultiVaultDepositFlow } from "@/hooks/deposit/useMultiVaultDepositFlow";
import { useRunOnce } from "@/hooks/useRunOnce";

import { DepositProgressView } from "./DepositProgressView";

interface DepositSignContentProps {
  vaultAmounts: bigint[];
  mempoolFeeRate: number;
  btcWalletProvider: BitcoinWallet;
  depositorEthAddress: Address | undefined;
  selectedApplication: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  getMnemonic: () => Promise<string>;
  mnemonicId?: string;
  htlcSecretHexes: string[];
  depositorSecretHashes: Hex[];
  onSuccess: (
    peginTxHash: string,
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
  vaultAmounts,
  htlcSecretHexes,
  depositorSecretHashes,
  ...flowParams
}: DepositSignContentProps) {
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
    htlcSecretHexes,
    depositorSecretHashes,
    ...flowParams,
  });

  // Auto-start the flow on mount
  const startFlow = useCallback(async () => {
    const result = await executeMultiVaultDeposit();
    if (result) {
      onRefetchActivities?.();
      const firstPegin = result.pegins[0];
      if (firstPegin) {
        onSuccess(
          firstPegin.peginTxHash,
          firstPegin.ethTxHash,
          firstPegin.depositorBtcPubkey,
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

  const vaultCount = vaultAmounts.length;

  return (
    <>
      {vaultCount > 1 ? (
        <DepositProgressView
          variant="multi"
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
      ) : (
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
          successMessage={DEPOSIT_SUCCESS_MESSAGE}
        />
      )}
      {artifactDownloadInfo && (
        <ArtifactDownloadModal
          open={!!artifactDownloadInfo}
          onClose={handleClose}
          onComplete={continueAfterArtifactDownload}
          providerAddress={artifactDownloadInfo.providerAddress}
          peginTxid={artifactDownloadInfo.peginTxid}
          depositorPk={artifactDownloadInfo.depositorPk}
        />
      )}
    </>
  );
}
